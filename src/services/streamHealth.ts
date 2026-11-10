import type {HardwareAcceleration, StreamMetrics} from '../types';
export function outputHealth(metrics:Pick<StreamMetrics,'fps'|'bitrateKbps'|'droppedFrames'>,targetFps:number):StreamMetrics['connectionQuality'] {
  if(metrics.bitrateKbps<=0 || metrics.fps<targetFps*.8 || metrics.droppedFrames>=30) return 'Poor';
  if(metrics.fps<targetFps*.95 || metrics.droppedFrames>=5) return 'Fair';
  return metrics.droppedFrames>0 ? 'Good' : 'Excellent';
}
export const encoderLabel=(encoder:HardwareAcceleration,mode?:'copy'|'encode')=>mode==='copy' ? 'Direct copy (no live encoding)' : encoder==='Auto' ? 'Software CBR (Auto)' : encoder;
