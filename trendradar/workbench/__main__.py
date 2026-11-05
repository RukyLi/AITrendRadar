import argparse
import os
from pathlib import Path

from .store import Store


def main():
    parser=argparse.ArgumentParser(description='AITrendRadar persistent workbench')
    parser.add_argument('command',choices=['serve','worker','monitor','newsnow','import','update','start','stop','status'],default='serve',nargs='?')
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8787)
    parser.add_argument('--root',default=os.getenv('RADAR_ROOT',str(Path.cwd())))
    args=parser.parse_args()
    if args.command=='newsnow':
        from .control import run_newsnow
        run_newsnow(Path(args.root))
        return
    if args.command in {'start','stop','status'}:
        from .control import manage
        manage(args.command,args.root,args.port)
        return
    store=Store(args.root)
    store.initialize()
    if args.command=='serve':
        import uvicorn
        from .api import create_app
        uvicorn.run(create_app(args.root,store),host=args.host,port=args.port)
    elif args.command=='worker':
        from .worker import Worker
        Worker(store).run()
    elif args.command=='monitor':
        from .monitor_worker import MonitorWorker
        MonitorWorker(store).run()
    elif args.command=='import': print({'imported':store.import_archives(),'totals':store.meta()})
    elif args.command=='update': print(store.enqueue('update'))


if __name__=='__main__': main()
