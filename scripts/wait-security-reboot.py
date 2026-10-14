"""Reconnect only with the pinned server host key and dedicated local key."""
import sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'.tools/python'))
import paramiko
started=time.monotonic()
while time.monotonic()-started<240:
    client=paramiko.SSHClient();client.load_host_keys(str(Path.home()/'.ssh/known_hosts'))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    try:
        client.connect('YOUR_SERVER_HOST',username='root',key_filename=str(Path.home()/'.ssh/YOUR_SSH_KEY'),allow_agent=False,look_for_keys=False,timeout=5,banner_timeout=5,auth_timeout=5)
        _,stdout,_=client.exec_command('test "$(cat /proc/sys/kernel/random/boot_id)" != "$(cat /root/peiliao-security/pre-reboot-boot-id)" && uname -r',timeout=10)
        kernel=stdout.read().decode().strip();status=stdout.channel.recv_exit_status()
        if status==0:
            print('PASS new boot, pinned host identity and dedicated-key SSH:',kernel,flush=True)
            sys.exit(0)
    except (OSError,paramiko.SSHException):
        pass
    finally:client.close()
    print('Waiting for approved reboot recovery; elapsed seconds',round(time.monotonic()-started),flush=True)
    time.sleep(5)
raise SystemExit('Recovery not verified within timeout')
