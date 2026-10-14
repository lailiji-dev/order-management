"""Minimal official-code upgrade; preserve existing runtime and panel state."""
import hashlib,json,os,shutil,sqlite3,stat,sys,zipfile

LIVE='/www/server/panel'
ARCHIVE='/root/peiliao-security/panel-13.1.0.zip'
PROTECTED={'data','config','vhost','ssl','pyenv','rewrite','plugin','logs','temp','tmp'}

def digest(path):
    value=hashlib.sha256()
    with open(path,'rb') as stream:
        for chunk in iter(lambda:stream.read(1048576),b''):value.update(chunk)
    return value.hexdigest()

def snapshot():
    result={'files':{},'tables':{},'version':None}
    for directory in ['ssl','data']:
        base=os.path.join(LIVE,directory)
        for current,dirs,files in os.walk(base):
            # Logs/cache are transient; all existing credential/certificate/config
            # files and SQLite databases are covered by the complete archive.
            dirs[:]=[name for name in dirs if name not in {'cache','session','sessions','__pycache__'}]
            for name in files:
                if name.endswith(('.db','-wal','-shm','.log')):continue
                path=os.path.join(current,name)
                if os.path.isfile(path):result['files'][os.path.relpath(path,LIVE)]=digest(path)
    for filename in ['data/default.db','data/db/panel.db','data/db/site.db','data/db/crontab.db']:
        path=os.path.join(LIVE,filename)
        if not os.path.isfile(path):continue
        connection=sqlite3.connect('file:'+path+'?mode=ro',uri=True)
        for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            if table.startswith('sqlite_'):continue
            rows=connection.execute('SELECT * FROM "'+table.replace('"','""')+'"').fetchall()
            data=json.dumps(rows,sort_keys=True,default=lambda value:value.hex() if isinstance(value,bytes) else str(value))
            result['tables'][filename+':'+table]={'count':len(rows),'fingerprint':hashlib.sha256(data.encode()).hexdigest()}
        connection.close()
    return result

def install(report_path):
    before=snapshot();written=[];new_defaults=[]
    with zipfile.ZipFile(ARCHIVE) as archive:
        for member in archive.infolist():
            if member.filename.endswith('/'):continue
            relative=member.filename[len('panel/'):]
            if not relative or '..' in relative.split('/') or relative.startswith('/'):raise RuntimeError('Unsafe member')
            target=os.path.join(LIVE,relative)
            first=relative.split('/')[0]
            if first in PROTECTED and os.path.lexists(target):continue
            if first in {'pyenv','ssl','plugin','logs','temp','tmp'}:continue
            if os.path.islink(target):raise RuntimeError('Refusing to overwrite panel symlink')
            parent=os.path.dirname(target);os.makedirs(parent,exist_ok=True)
            temporary=target+'.peiliao-upgrade-part'
            with open(temporary,'wb') as stream:stream.write(archive.read(member))
            mode=stat.S_IMODE(os.stat(target).st_mode) if os.path.isfile(target) else ((member.external_attr>>16)&0o777 or 0o644)
            if relative in {'BT-Panel','BT-Task','init.sh'} or relative.startswith('bt-task-linux-'):mode=0o700
            os.chmod(temporary,mode);os.replace(temporary,target)
            written.append(relative)
            if first in PROTECTED:new_defaults.append(relative)
    # Purge only code bytecode; retain every runtime/plugin/state cache.
    for base in ['class','mod','BTPanel']:
        for current,dirs,files in os.walk(os.path.join(LIVE,base)):
            for name in files:
                if name.endswith('.pyc'):os.unlink(os.path.join(current,name))
    after=snapshot()
    changed=[path for path,fingerprint in before['files'].items() if after['files'].get(path)!=fingerprint]
    table_changes=[name for name,record in before['tables'].items() if after['tables'].get(name)!=record]
    report={'before':before,'after_install':after,'written':written,'new_defaults':new_defaults,'changed_existing_state_files':changed,'changed_existing_tables':table_changes}
    with open(report_path,'w') as stream:json.dump(report,stream,ensure_ascii=False,indent=2)
    os.chmod(report_path,0o600)
    print('vendor_files_written',len(written),'new_defaults',len(new_defaults),'existing_state_files_changed',len(changed),'existing_database_tables_changed',len(table_changes))
    if changed or table_changes:raise RuntimeError('Existing panel state changed unexpectedly')

if __name__=='__main__':install(sys.argv[1])
