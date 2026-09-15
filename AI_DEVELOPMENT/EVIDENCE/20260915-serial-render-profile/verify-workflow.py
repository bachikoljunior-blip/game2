from pathlib import Path
import base64, contextlib, hashlib, io, json, os, shutil, subprocess, tempfile, zipfile
from unittest import mock
import yaml

repo = Path(__file__).resolve().parents[3]
evidence = Path(__file__).resolve().parent
workflow = yaml.load((repo/'.github/workflows/fresh-render-profile.yml').read_text(), Loader=yaml.BaseLoader)
job = workflow['jobs']['profile']
assert len(workflow['jobs']) == 1 and 'strategy' not in job
assert job['timeout-minutes'] == '18' and job['runs-on'] == 'ubuntu-latest'
steps = job['steps']
assert steps[0]['with']['ref'] == '${{ github.sha }}'
assert sum(step.get('run') == 'npm ci' for step in steps) == 1
assert sum(step.get('run') == 'npx playwright install --with-deps chromium' for step in steps) == 1
serial = next(step for step in steps if step.get('id') == 'serial')
assert serial['continue-on-error'] == 'true'
assert steps[-1]['if'] == 'always()' and steps[-1]['env']['SERIAL_OUTCOME'] == '${{ steps.serial.outcome }}'
assert steps[-1]['run'] == 'test "$SERIAL_OUTCOME" = success'
body = serial['run'].removeprefix("python - <<'PY'\n").removesuffix('PY\n')
assert body == (evidence/'workflow-body.py').read_text()
compile(body, '<exact workflow Python>', 'exec')
sha = lambda data: hashlib.sha256(data).hexdigest()
event = '1234567890abcdef1234567890abcdef12345678'  # Synthetic distinct event commit, never a real measurement.
acf = 'acf0f9ec86996245ad712d6adc72e5d6159f6711'
previous = '9068522520b0f269cc937057b444f06c7c187978'
expected = [acf, previous, event, event, previous, acf]
fixed_tool = (repo/'tools/fresh-render-profile.mjs').read_bytes()
source_trees = {revision: sha(revision.encode())[:40] for revision in expected}
reports = []

def scenario(kind):
    with tempfile.TemporaryDirectory(prefix='fixture-', dir=evidence) as temp:
        workspace = Path(temp)/'checkout'; workspace.mkdir()
        (workspace/'tools').mkdir(); (workspace/'tools/fresh-render-profile.mjs').write_bytes(fixed_tool)
        versions = {'three':'0.180.0','vite':'6.4.3','playwright':'1.56.1'}
        for name, version in versions.items():
            package = workspace/'node_modules'/name; package.mkdir(parents=True)
            (package/'package.json').write_text(json.dumps({'version':version}))
        worktrees = {}; attempts = []; nodes = []; originals = {}; removed = []
        def completed(args, stdout=''):
            return subprocess.CompletedProcess(args, 0, stdout=stdout, stderr='')
        def fake_run(args, **kwargs):
            args = list(args)
            if args == ['node','--version']:
                return completed(args, 'v22.fixture\n')
            if args[0] == 'git':
                if args[1:3] == ['worktree','add']:
                    source, revision = Path(args[-2]), args[-1]; ordinal = int(source.name.split('-')[-2])
                    attempts.append((ordinal,revision))
                    if kind == 'mixed-failures' and ordinal == 4:
                        raise subprocess.CalledProcessError(23,args,stderr='synthetic worktree failure')
                    source.mkdir(); worktrees[str(source)] = revision
                    return completed(args)
                if args[1:3] == ['worktree','remove']:
                    source=Path(args[-1]); assert not (source/'node_modules').exists()
                    removed.append(str(source)); shutil.rmtree(source); return completed(args)
                if args[1] == '-C':
                    assert args[3:] == ['rev-parse','HEAD']; return completed(args,worktrees[args[2]]+'\n')
                if args == ['git','rev-parse','HEAD']:
                    return completed(args,event+'\n')
                if args[1:3] == ['rev-parse','--verify']:
                    revision=args[-1].removesuffix('^{commit}'); assert revision in expected
                    return completed(args,revision+'\n')
                if args[1] == 'rev-parse' and args[-1].endswith(':fresh'):
                    return completed(args,source_trees[args[-1][:-6]]+'\n')
                raise AssertionError('unrecognized git operation '+str(args))
            assert args == ['node',str(workspace/'tools/fresh-render-profile.mjs')]
            assert 'timeout' not in kwargs and kwargs['check'] is False
            env=kwargs['env']; assert env['PROFILE_VARIANTS']=='full'
            folder=Path(env['PROFILE_OUTPUT']); ordinal=int(folder.name.split('-')[0]); source=Path(env['PROFILE_SOURCE_ROOT'])
            revision=worktrees[str(source)]; assert (source/'node_modules').resolve()==(workspace/'node_modules').resolve()
            nodes.append(ordinal)
            frames=[{'frame':frame,'result':'measured','pixels':{'nontrivial':True},'cpuRenderMs':10+frame,'readbackWallMs':20+frame,'totalWallMs':30+2*frame,
                     'gl':{'beforeError':0,'afterError':0,'defaultReadFramebuffer':True,'beforeContextLost':False,'afterContextLost':False}} for frame in range(13)]
            png=b'PNG_SYNTHETIC_BYTE_FIXTURE_'+str(ordinal).encode()
            data={'result':'passed','sourceRevision':revision,'sourceFreshTree':source_trees[revision],'apparatusSha256':sha(fixed_tool),'dependencies':versions,
                  'sourceUnchanged':True,'restoration':{'restored':True},'variants':['full'],'viewport':{'width':960,'height':720,'dpr':1},
                  'errors':[],'glErrorDiagnostics':[],'consoleErrors':[],'pageErrors':[],'requestFailures':[],
                  'cleanup':{'browserClosed':True,'browserProcessClosed':True,'serverClosed':True},
                  'cases':[{'variant':'full','result':'measured','samples':frames,'firstCompileFrame':frames[0],
                            'capture':{'result':'passed','sha256':sha(png)},'warm12Summary':{'totalWallMs':{'min':32,'median':43,'max':54}}}]}
            code=0
            if kind=='mixed-failures' and ordinal==2:
                data['result']='failed'; data['errors']=['synthetic GL failure']; data['cases'][0]['samples']=frames[:4]; png=None; code=17
            if kind=='mixed-failures' and ordinal==5:
                data['sourceUnchanged']=False
            raw=json.dumps(data,separators=(',',':')).encode()
            if kind=='unsafe-and-invalid' and ordinal==3:
                raw=b'{synthetic invalid JSON, retained byte-for-byte'
            report_path=folder/'report.json'
            if kind=='unsafe-and-invalid' and ordinal==2:
                outside=workspace/'outside.txt'; outside.write_bytes(b'SYNTHETIC_OUTSIDE_NOT_ALLOWED')
                report_path.symlink_to(outside)
            else:
                report_path.write_bytes(raw); originals[folder.name+'/report.json']=raw
            if png is not None:
                (folder/'full.png').write_bytes(png); originals[folder.name+'/full.png']=png
            return subprocess.CompletedProcess(args,code)
        capture=io.StringIO()
        env={'GITHUB_WORKSPACE':str(workspace),'GITHUB_SHA':event,'GITHUB_RUN_ID':'fixture-run','GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'profile','RUNNER_OS':'Linux','RUNNER_ARCH':'X64'}
        with mock.patch.dict(os.environ,env),mock.patch('subprocess.run',fake_run),contextlib.redirect_stdout(capture):
            try:
                exec(compile(body,'<exact workflow Python>','exec'),{'__name__':'__main__'})
            except SystemExit as error:
                exit_code=error.code
        root=workspace/'AI_DEVELOPMENT/EVIDENCE/fresh-render-profile/serial'
        summary=json.loads((root/'summary.json').read_text()); manifest=json.loads((root/'manifest.json').read_text())
        assert [revision for _,revision in attempts]==expected
        assert [item['revision'] for item in summary['ordinals']]==expected
        assert [item['ordinal'] for item in summary['ordinals']]==list(range(1,7))
        assert [item['ordinals'] for item in summary['pairs']]==[[1,6],[2,5],[3,4]]
        assert [item['label'] for item in summary['pairs']]==['acf','906','current']
        assert manifest['eventRevision']==event and manifest['apparatusSha256']==sha(fixed_tool)
        assert len({item['hostRecordSha256'] for item in summary['ordinals']})==1
        assert summary['ordinals'][-1]['result']=='passed', 'earlier failure must not skip the final baseline'
        assert exit_code==(0 if kind=='success' else 1)
        assert summary['comparisonComplete']==(kind=='success')
        if kind=='mixed-failures':
            assert nodes==[1,2,3,5,6]
            assert [item['ordinal'] for item in summary['ordinals'] if item['result']=='failed']==[2,4,5]
            assert summary['ordinals'][1]['toolExitCode']==17
        if kind=='unsafe-and-invalid':
            assert nodes==list(range(1,7))
            assert [item['ordinal'] for item in summary['ordinals'] if item['result']=='failed']==[2,3]
        archives=[]; envelope=None; chunks=[]; recovered={}
        for line in capture.getvalue().splitlines():
            if line.startswith('MEDIA_ARCHIVE_BEGIN '):
                envelope=json.loads(line.removeprefix('MEDIA_ARCHIVE_BEGIN ')); chunks=[]
            elif line.startswith('MEDIA_BYTES '):
                chunk=line.removeprefix('MEDIA_BYTES '); assert len(chunk)<=6000; chunks.append(chunk)
            elif line=='MEDIA_ARCHIVE_END':
                payload=base64.b64decode(''.join(chunks)); assert sha(payload)==envelope['sha256'] and len(payload)==envelope['bytes']
                with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                    assert archive.testzip() is None
                    assert archive.namelist()==[item['path'] for item in envelope['files']]
                    for entry in envelope['files']:
                        value=archive.read(entry['path']); assert sha(value)==entry['sha256'] and len(value)==entry['bytes']
                        assert b'SYNTHETIC_OUTSIDE_NOT_ALLOWED' not in value
                        recovered[entry['path']]=value
                archives.append(envelope['version'])
        assert len(archives)==7 and len([name for name in recovered if name.endswith('/ordinal.json')])==6
        for name, original in originals.items():
            assert recovered[name]==original
        assert sha((workspace/'tools/fresh-render-profile.mjs').read_bytes())==sha(fixed_tool)
        return {'scenario':kind,'exitCode':exit_code,'worktreeAttempts':len(attempts),'toolCalls':nodes,'ordinalResults':[item['result'] for item in summary['ordinals']],
                'archives':archives,'originalByteFilesVerified':len(originals),'ownedWorktreesRemoved':len(removed)}

for kind in ('success','mixed-failures','unsafe-and-invalid'):
    reports.append(scenario(kind))
early_controls=[]
for supplied, checkout, expected_message in [('current',event,'exact commit'),(event,'f'*40,'checkout must match')]:
    with tempfile.TemporaryDirectory(prefix='rejected-event-',dir=evidence) as temp:
        env={'GITHUB_WORKSPACE':temp,'GITHUB_SHA':supplied,'GITHUB_RUN_ID':'fixture-run'}
        calls=[]
        def rejected_run(args, **kwargs):
            calls.append(list(args));return subprocess.CompletedProcess(args,0,stdout=checkout+'\n',stderr='')
        with mock.patch.dict(os.environ,env),mock.patch('subprocess.run',rejected_run):
            try:
                exec(compile(body,'<exact workflow Python>','exec'),{'__name__':'__main__'})
            except AssertionError as error:
                assert expected_message in str(error)
            else:
                raise AssertionError('unsafe event source was not rejected')
        assert len(calls)==(0 if supplied=='current' else 1)
        early_controls.append({'control':expected_message,'rejectedBeforeMeasurement':True})
result={'result':'passed','eventSourceNegativeControls':early_controls,'scope':'Parsed exact YAML/Python; executed exact orchestration with synthetic subprocess/report/PNG-byte fixtures. No real browser, image, timing, remote action or host-comparison result.',
        'workflowSha256':sha((repo/'.github/workflows/fresh-render-profile.yml').read_bytes()),'unchangedProfilerSha256':sha(fixed_tool),'scenarios':reports}
(evidence/'validation-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
