# Battery scheduling QA — November 3, 2026

Tested the isolated native 1.0.7 QA app with a generated eight-second H.264/AAC 1080p/30 clip, a local-only RTMP receiver and a three-loop scheduled stop. Production broadcasts were not changed.

## Power verification

The user unplugged the charger and left the lid open. `pmset -g batt` continued to label the source AC, but the battery controller independently reported `ExternalConnected=No`, `ExternalChargeCapable=No`, `IsCharging=No` and declining charge. Five-second controller samples confirmed no external power throughout the captured tests. No charging/sleep settings were changed for battery operation.

## Results so far

| Test | Result |
|---|---|
| Scheduled start at 21:55 while on battery | Passed; live telemetry approximately 29.7 FPS and 4.9 Mbps, zero errors/reconnects |
| Three complete loops and natural stop | Passed: 720 video frames, 1920×1080 H.264 at 30 FPS, AAC, 24.034 seconds, approximately 4.887 Mbps total bitrate |
| Brief system sleep followed by scheduled wake on battery | Observed: power log entered sleep at 21:56:57 and woke at 21:57:01 using battery, with RTC/HID activity in the wake reason; the QA wake alarm had been set for 21:57 |
| Scheduled start at 21:59 after wake, with screen locked | Passed: the screen was explicitly locked at 21:58:40; session-state samples remained locked through stream completion; battery controller showed no external connection |
| Post-wake stream and loop stop | Passed: 720 frames, same 1080p/30 H.264/AAC output, 24.034 seconds, approximately 4.887 Mbps |

The first QA window was restarted before scheduling because navigation clicks stopped responding. No streaming was active at that point.

## Locked-before-sleep follow-up

After the user briefly unlocked to configure a final run, the screen was locked again before sleep at 22:02:22. Power logs recorded sleep at 22:02:27 and wake at 22:03:01 (approximately 34 seconds), using battery. The QA alarm was set for 22:03 and the stream for 22:05.

The receiver created its output at 22:05:07.648 and finished at 22:05:30.267. Its completed output again contained **720 frames at 1920×1080/30, AAC, 24.034 seconds**, approximately 4.885 Mbps. Controller samples reported no charger connection and no charging throughout. Session-state samples reported locked before sleep, after wake and through 22:05:05; the lock flag was absent at 22:05:10–22:05:25, then reported locked again. **The user confirmed unlocking during that interval.** The final test was therefore interrupted by an unlock and does not certify a completely uninterrupted locked sleep→wake→stream sequence.

Both sleep intervals were brief, not overnight standby tests. Three functional scheduled battery-streaming tests passed, including complete-loop stops. Scheduled waking on battery and a separate locked-screen stream were observed successfully; the full sequence without any unlock remains unverified.

Evidence is temporarily retained in `/tmp/studio-battery-qa/`: `awake.flv`, `wake.flv`, `locked-sleep-wake.flv`, battery/lock samples and relevant sleep/wake timestamps. Receivers and sampling workers completed or were stopped. This is a single-stream test on this Mac, not certification of four streams on an unspecified 8 GB laptop. Battery charge during the tests changed from approximately 83% to 79%; this short test is not a runtime estimate.

The idle QA app was closed afterward to release its keep-awake helper. Unrelated Apple system wake alarms were preserved.
