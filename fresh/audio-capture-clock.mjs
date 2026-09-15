// A MediaRecorder boundary must follow the audio render clock, not merely a
// wall-clock timer. Kept self-contained so the same function runs in the page.
export async function waitForAudioTime(context,target,{poll=()=>new Promise(resolve=>setTimeout(resolve,20)),now=()=>performance.now(),timeoutMs=15000}={}){
  const wallStart=now(),audioStart=context.currentTime;
  while(context.currentTime<target){
    if(context.state!=='running')throw new Error(`Audio clock stopped during capture preparation: ${context.state}`);
    if(now()-wallStart>timeoutMs)throw new Error(`Audio clock did not reach ${target}; last time ${context.currentTime}`);
    await poll();
  }
  return {audioStart,target,audioReached:context.currentTime,wallElapsedMs:now()-wallStart};
}
