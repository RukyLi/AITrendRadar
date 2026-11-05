"""Local lifecycle management for the four owned processes."""
import os
import signal
import socket
import subprocess
import sys
import time
import shutil
from pathlib import Path
from http.client import HTTPConnection


def wait_ready(port, path, timeout=20):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        try:
            connection=HTTPConnection('127.0.0.1',port,timeout=1)
            connection.request('GET',path)
            ok=connection.getresponse().status==200
            connection.close()
            if ok: return True
        except OSError: pass
        time.sleep(.2)
    return False


def alive(pid, role, root):
    try:
        command=subprocess.check_output(['ps','-p',str(pid),'-o','args='],text=True,stderr=subprocess.DEVNULL)
        if role=='newsnow': return str(root/'vendor/newsnow/dist/output/server/index.mjs') in command
        return 'trendradar.workbench' in command and role in command and str(root) in command
    except (subprocess.CalledProcessError,ProcessLookupError):
        return False


def manage(command,root,port=8787):
    root=Path(root).resolve()
    run=root/'.run'
    run.mkdir(exist_ok=True)
    roles=['newsnow','serve','monitor','worker']
    pids={role:int((run/f'workbench-{role}.pid').read_text()) if (run/f'workbench-{role}.pid').exists() else 0 for role in roles}
    running={role:alive(pids[role],role,root) if pids[role] else False for role in roles}
    if command=='status':
        for role in roles: print(f'{role}: '+(f'running (PID {pids[role]})' if running[role] else 'stopped'))
        if running['serve']: print(f'工作台：http://127.0.0.1:{port}')
        return
    if command=='stop':
        # Finish/interrupt writers before taking their provider away.
        for group in (['worker','monitor'], ['serve','newsnow']):
            for role in group:
                if running[role] and alive(pids[role],role,root): os.kill(pids[role],signal.SIGTERM)
            deadline=time.monotonic()+10
            while time.monotonic()<deadline and any(alive(pids[r],r,root) for r in group if running[r]): time.sleep(.2)
            for role in group:
                if running[role] and alive(pids[role],role,root): os.kill(pids[role],signal.SIGKILL)
        for role in roles:
            if running[role] and alive(pids[role],role,root): os.kill(pids[role],signal.SIGKILL)
            (run/f'workbench-{role}.pid').unlink(missing_ok=True)
        print('工作台已停止；未完成任务将在下次启动恢复。')
        return
    if not (root/'frontend/dist/index.html').exists(): raise SystemExit('请先运行 npm --prefix frontend ci && npm --prefix frontend run build')
    if not (root/'vendor/newsnow/dist/output/server/index.mjs').exists():
        raise SystemExit('请先安装并构建采集服务：pnpm --dir vendor/newsnow run build:radar')
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
        if role=='newsnow':
            with socket.socket() as sock:
                sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
                try: sock.bind(('127.0.0.1',int(os.getenv('NEWSNOW_PORT','8788'))))
                except OSError: raise SystemExit('NewsNow 端口被占用，请设置 NEWSNOW_PORT')
        args=[sys.executable,'-m','trendradar.workbench',role,'--root',str(root)]
        if role=='serve': args+=['--port',str(port)]
        with open(run/f'workbench-{role}.log','a') as logfile:
            child=subprocess.Popen(args,cwd=root,stdin=subprocess.DEVNULL,stdout=logfile,stderr=subprocess.STDOUT,start_new_session=True)
        (run/f'workbench-{role}.pid').write_text(str(child.pid))
        if role=='newsnow':
            wait_ready(int(os.getenv('NEWSNOW_PORT','8788')),'/api/s/health')
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
    # Check the provider separately; never report it healthy just because Web responds.
    provider_ready=wait_ready(int(os.getenv('NEWSNOW_PORT','8788')),'/api/s/health',timeout=5)
    print(f'工作台：http://127.0.0.1:{port}\n采集服务：'+('已就绪' if provider_ready else '尚未就绪，请检查 workbench-newsnow.log')+f'\n日志：{run}/workbench-*.log\n停止：bash start-local.sh stop')


def run_newsnow(root):
    node=shutil.which('node')
    if not node: raise SystemExit('NewsNow 需要 Node 24')
    entry=root/'vendor/newsnow/dist/output/server/index.mjs'
    if not entry.exists(): raise SystemExit('NewsNow 尚未构建')
    allowed={'PATH','HOME','TMPDIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NEWSNOW_WEIBO_COOKIE','PRODUCTHUNT_API_TOKEN'}
    env={k:v for k,v in os.environ.items() if k in allowed}
    for key in ('HTTP_PROXY','HTTPS_PROXY'):
        if os.getenv('NEWSNOW_'+key): env[key]=os.environ['NEWSNOW_'+key]
    env.update(HOST='127.0.0.1',PORT=os.getenv('NEWSNOW_PORT','8788'),NODE_ENV='production',ENABLE_CACHE='true',INIT_TABLE='true',NODE_USE_ENV_PROXY='1')
    os.chdir(root/'vendor/newsnow')
    os.execve(node,[node,str(entry)],env)
