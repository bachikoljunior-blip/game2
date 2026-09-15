// Browser-independent apparatus logic. The deadline limits NEW input starts;
// every sent pulse gets one subsequent read, even if its round trip crosses it.
// A late observation is recorded as late, never as proof of 3000ms acceptance.
export async function retryDodgeUntilObserved({before,read,tap,now=Date.now,startedAt=now(),timeoutMs=3000,record={}}){
  const deadline=startedAt+timeoutMs;
  Object.assign(record,{status:'pending',beforeDodges:before,startedAtMs:startedAt,inputDeadlineAtMs:deadline,inputWindowMs:timeoutMs,pulses:[],observations:[],
    timingScope:'Host wall timestamps include browser command round trips. Browser snapshot time and simulation event time are separate; actual input-to-acceptance latency is not measured.'});
  try{
    for(;;){
      const readStartedAt=now(),observed=await read(),receivedAt=now();
      const snapshot={...observed,readStartedAtMs:readStartedAt,receivedAtMs:receivedAt,elapsedMs:receivedAt-startedAt,afterInputDeadline:receivedAt>deadline};
      record.observations.push(snapshot);
      if(observed.dodges>before){
        record.status='acknowledged';record.acknowledgement=snapshot;
        record.acknowledgementTiming=snapshot.afterInputDeadline?'observed-after-input-deadline':'observed-within-input-window';
        return observed;
      }
      if(observed.mode!=='playing')throw new Error('Mission ended before the recovery dodge was acknowledged');
      const pulseStartedAt=now();
      if(pulseStartedAt>=deadline){
        record.status='unacknowledged';
        throw new Error(`Recovery dodge was not observed after the final read for its ${timeoutMs}ms input deadline`);
      }
      const pulse={startedAtMs:pulseStartedAt,startedElapsedMs:pulseStartedAt-startedAt};record.pulses.push(pulse);
      try{await tap();}finally{pulse.finishedAtMs=now();pulse.finishedElapsedMs=pulse.finishedAtMs-startedAt;}
      // Read before checking the deadline again. Do not issue an extra pulse,
      // wait/poll past the deadline, or discard a successful final pulse.
    }
  }catch(error){
    if(record.status==='pending')record.status='failed';record.failure=String(error);throw error;
  }
}
