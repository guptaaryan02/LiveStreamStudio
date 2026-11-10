//! Explicit, owner-scoped macOS wake alarms. Never replace system repeat events
//! or cancel another application's alarms. Administrator approval is requested
//! only from the Scheduler's wake/remove buttons.
use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct WakeChanges(Mutex<()>);

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WakeAlarm {
    schedule_id: String,
    wake_date: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerStatus {
    supported: bool,
    idle_sleep_prevented: bool,
    alarms: Vec<WakeAlarm>,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

fn valid_date(date: &str) -> bool {
    date.len() == 17 && date.bytes().enumerate().all(|(i, b)| match i {
        2 | 5 => b == b'/', 8 => b == b' ', 11 | 14 => b == b':', _ => b.is_ascii_digit(),
    })
}

// Newer macOS prints a four-digit year even when pmset accepted a two-digit
// input. Normalize both forms before verifying/cancelling our exact event.
fn normalize_date(date: &str) -> Option<String> {
    if !date.is_ascii() { return None; }
    let short = if date.len() == 19 && date.as_bytes()[6..10].iter().all(u8::is_ascii_digit) {
        format!("{}{}", &date[..6], &date[8..])
    } else { date.to_string() };
    valid_date(&short).then_some(short)
}

fn parse_alarms(output: &str, prefix: &str) -> Vec<WakeAlarm> {
    output.lines().filter_map(|line| {
        let (_, tail) = line.split_once("wake at ")?;
        let (date, owner) = tail.split_once(" by ")?;
        let id = owner.trim().trim_matches('\'').trim_matches('"').strip_prefix(prefix)?;
        if !valid_id(id) { return None; }
        Some(WakeAlarm { schedule_id: id.into(), wake_date: normalize_date(date.trim())? })
    }).collect()
}

fn prefix(app: &AppHandle) -> Result<String, String> {
    let id = &app.config().identifier;
    if !valid_id(id) { return Err("Invalid application identifier".into()); }
    Ok(format!("{}.schedule.", id))
}

fn read_alarms(prefix: &str) -> Result<Vec<WakeAlarm>, String> {
    let output = Command::new("/usr/bin/pmset").args(["-g", "sched"]).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err("Could not read macOS wake alarms".into()); }
    Ok(parse_alarms(&String::from_utf8_lossy(&output.stdout), prefix))
}

#[tauri::command]
pub fn get_schedule_power_status(app: AppHandle, state: State<'_, crate::FFmpegState>) -> Result<PowerStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let prevented = state.keep_awake.lock().map_err(|_| "Power state unavailable")?
            .as_mut().map(|child| matches!(child.try_wait(), Ok(None))).unwrap_or(false);
        return Ok(PowerStatus { supported: true, idle_sleep_prevented: prevented, alarms: read_alarms(&prefix(&app)?)? });
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, state); Ok(PowerStatus { supported: false, idle_sleep_prevented: false, alarms: vec![] }) }
}

fn wake_commands(owner_prefix: &str, id: &str, date: Option<&str>, alarms: &[WakeAlarm]) -> Result<Vec<String>, String> {
    if !valid_id(id) || date.is_some_and(|d| !valid_date(d)) { return Err("Invalid wake alarm".into()); }
    let owner = format!("{}{}", owner_prefix, id);
    if !valid_id(&owner) { return Err("Invalid wake owner".into()); }
    let mut commands = vec![];
    if let Some(date) = date {
        if !alarms.iter().any(|a| a.schedule_id == id && a.wake_date == date) {
            commands.push(format!("/usr/bin/pmset schedule wake '{}' '{}'", date, owner));
        }
    }
    for old in alarms.iter().filter(|a| a.schedule_id == id && Some(a.wake_date.as_str()) != date) {
        if !valid_date(&old.wake_date) { return Err("Invalid existing wake alarm".into()); }
        commands.push(format!("/usr/bin/pmset schedule cancel wake '{}' '{}'", old.wake_date, owner));
    }
    Ok(commands)
}

#[tauri::command]
pub async fn configure_schedule_wake(app: AppHandle, schedule_id: String, start_at_seconds: Option<i64>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return tauri::async_runtime::spawn_blocking(move || {
        let changes = app.state::<WakeChanges>();
        let _guard = changes.0.try_lock().map_err(|_| "Another wake alarm change is awaiting approval")?;
        let prefix = prefix(&app)?;
        let date = if let Some(start) = start_at_seconds {
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs() as i64;
            if start < now + 180 || start > now + 366 * 86400 { return Err("Choose a start time at least 3 minutes and at most one year ahead".into()); }
            let output = Command::new("/bin/date").args(["-r", &(start - 120).to_string(), "+%m/%d/%y %H:%M:%S"]).output().map_err(|e| e.to_string())?;
            if !output.status.success() { return Err("Could not convert the wake time".into()); }
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else { None };
        let commands = wake_commands(&prefix, &schedule_id, date.as_deref(), &read_alarms(&prefix)?)?;
        if commands.is_empty() { return Ok(()); }
        // All values have a strict ASCII allowlist; neither titles, paths nor
        // credentials enter this privileged script. No password is collected.
        let shell = commands.join(" && ");
        let script = format!("do shell script \"{}\" with administrator privileges with prompt \"Allow LiveStream Studio to update its scheduled wake alarm.\"", shell);
        let output = Command::new("/usr/bin/osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("Wake alarm was not configured. Administrator approval was cancelled or macOS rejected the change. Keep Studio open and prevent sleep, or try again.".into());
        }
        let actual = read_alarms(&prefix)?;
        let verified = match date {
            Some(date) => actual.iter().any(|a| a.schedule_id == schedule_id && a.wake_date == date),
            None => !actual.iter().any(|a| a.schedule_id == schedule_id),
        };
        if verified { Ok(()) } else { Err("macOS did not confirm the wake alarm; it is not marked ready".into()) }
    }).await.map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, schedule_id, start_at_seconds); Err("Wake alarms are currently supported on macOS only".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_only_our_wake_events() {
        let text = "[0] wake at 11/04/2026 04:58:00 by 'com.test.schedule.sch-1'\n[1] wake at 11/04/26 05:00:00 by 'com.other.schedule.sch-1'\n[2] sleep at 11/04/26 06:00:00 by 'com.test.schedule.sch-2'";
        assert_eq!(parse_alarms(text, "com.test.schedule."), vec![WakeAlarm { schedule_id: "sch-1".into(), wake_date: "11/04/26 04:58:00".into() }]);
        assert_eq!(normalize_date("11/04/26 04:58:00"), Some("11/04/26 04:58:00".into()));
    }
    #[test]
    fn replacement_and_cancel_never_touch_other_alarms() {
        let alarms = vec![WakeAlarm { schedule_id: "one".into(), wake_date: "11/04/26 04:58:00".into() }, WakeAlarm { schedule_id: "two".into(), wake_date: "11/04/26 04:58:00".into() }];
        let commands = wake_commands("com.test.schedule.", "one", Some("11/05/26 04:58:00"), &alarms).unwrap();
        assert_eq!(commands.len(), 2);
        assert!(commands[0].contains("schedule wake"));
        assert!(commands[1].contains("schedule cancel wake"));
        assert!(commands.iter().all(|c| !c.contains("two") && !c.contains("repeat") && !c.contains("cancelall")));
        assert_eq!(wake_commands("com.test.schedule.", "one", Some("11/04/26 04:58:00"), &alarms).unwrap().len(), 0);
        assert_eq!(wake_commands("com.test.schedule.", "one", None, &alarms).unwrap().len(), 1);
    }
    #[test]
    fn privileged_arguments_reject_injection() {
        for bad in ["a'; reboot", "$(id)", "a\nfoo", ""] {
            assert!(wake_commands("com.test.", bad, None, &[]).is_err());
        }
        assert!(wake_commands("com.test.", "ok", Some("11/04/26 04:58:00; id"), &[]).is_err());
        assert!(wake_commands("bad'", "ok", None, &[]).is_err());
    }
}
