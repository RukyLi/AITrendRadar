"""Local lifecycle management for the two owned processes."""
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path


def alive(pid, role, root):
    try:
        command=subprocess.check_output(['ps','-p',str(pid),'-o','args='],text=True,stderr=subprocess.DEVNULL)
        return 'trendradar.workbench' in command and role in command and str(root) in command
    except (subprocess.CalledProcessError,ProcessLookupError):
        return False


def manage(command,root,port=8787):
    root=Path(root).resolve()
    run=root/'.run'
    run.mkdir(exist_ok=True)
    roles=['serve','worker']
    pids={role:int((run/f'workbench-{role}.pid').read_text()) if (run/f'workbench-{role}.pid').exists() else 0 for role in roles}
    running={role:alive(pids[role],role,root) if pids[role] else False for role in roles}
    if command=='status':
        for role in roles: print(f'{role}: '+(f'running (PID {pids[role]})' if running[role] else 'stopped'))
        if running['serve']: print(f'工作台：http://127.0.0.1:{port}')
        return
    if command=='stop':
        for role in roles:
            if running[role]: os.kill(pids[role],signal.SIGTERM)
        deadline=time.monotonic()+10
        while time.monotonic()<deadline and any(alive(pids[r],r,root) for r in roles if running[r]): time.sleep(.2)
        for role in roles:
            if running[role] and alive(pids[role],role,root): os.kill(pids[role],signal.SIGKILL)
            (run/f'workbench-{role}.pid').unlink(missing_ok=True)
        print('工作台已停止；未完成任务将在下次启动恢复。')
        return
    if not (root/'frontend/dist/index.html').exists(): raise SystemExit('请先运行 npm --prefix frontend ci && npm --prefix frontend run build')
    if not running['serve']:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            try: sock.bind(('127.0.0.1',port))
            except OSError: raise SystemExit(f'端口 {port} 已被其他服务占用，请设置 WEB_PORT 或先停止该服务。')
    from .store import Store
    store=Store(root)
    store.initialize()
    store.import_archives()
    for role in roles:
        if running[role]: continue
        args=[sys.executable,'-m','trendradar.workbench',role,'--root',str(root)]
        if role=='serve': args+=['--port',str(port)]
        with open(run/f'workbench-{role}.log','a') as logfile:
            child=subprocess.Popen(args,cwd=root,stdin=subprocess.DEVNULL,stdout=logfile,stderr=subprocess.STDOUT,start_new_session=True)
        (run/f'workbench-{role}.pid').write_text(str(child.pid))
    from http.client import HTTPConnection
    deadline=time.monotonic()+15
    ready=False
    while time.monotonic()<deadline:
        try:
            connection=HTTPConnection('127.0.0.1',port,timeout=1)
            connection.request('GET','/api/v1/health')
            ready=connection.getresponse().status==200
            connection.close()
            if ready: break
        except OSError:
            pass
        time.sleep(.2)
    if not ready:
        raise SystemExit(f'Web 服务未就绪，请查看 {run}/workbench-serve.log')
    print(f'工作台：http://127.0.0.1:{port}\n日志：{run}/workbench-*.log\n停止：bash start-local.sh stop')
