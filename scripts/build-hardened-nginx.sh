#!/bin/bash
# Candidate only: no nginx installation, service action or production config edit.
set -euo pipefail
umask 077
stage=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build
mkdir -p "$stage/downloads" "$stage/source" "$stage/keys" "$stage/candidate"
chmod 700 "$stage" "$stage/keys"
cd "$stage/downloads"
production_before=$(sha256sum /www/server/nginx/sbin/nginx | awk '{print $1}')
printf 'Preparing pinned sources in %s\n' "$stage"

fetch_checked() {
    local filename=$1 expected=$2 url=$3
    if [ ! -f "$filename" ]; then
        curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 15 --max-time 300 --silent --show-error "$url" -o "$filename.part"
        mv "$filename.part" "$filename"
    fi
    printf '%s  %s\n' "$expected" "$filename" | sha256sum --check --status
    printf '%s  %s\n' "$expected" "$filename" >> "$stage/verified-sha256.txt"
}

: > "$stage/verified-sha256.txt"
fetch_checked nginx-1.30.5.tar.gz 6c20565aa2325cb82216ae804f4a4ff1875179014759a381c42ddc8e11c4906d https://nginx.org/download/nginx-1.30.5.tar.gz
fetch_checked openssl-3.5.9.tar.gz 603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz
fetch_checked ngx_cache_purge-2.3.tar.gz 279e0d8a46d3b1521fd43b3f78bc1c08b263899142a7cc5058c1c0361a92c89c https://download.bt.cn/src/ngx_cache_purge-2.3.tar.gz
fetch_checked nginx-sticky-module-ng-1.3.0.zip 69a0d47b475a6b18d83f8001404a51c07d6ef61834b237d7a05ae391eb703ca0 https://download.bt.cn/src/nginx-sticky-module-ng-1.3.0.zip
fetch_checked lua-nginx-module-0.10.24.zip 7c58b1e6b128719acf7e54f728bf6b02c3b56f0b1d5a5013bdca6f50bf3d566e https://download.bt.cn/src/lua-nginx-module-0.10.24.zip
fetch_checked ngx_devel_kit-0.3.1.zip d183aff05f3e35dd9b191cfa90f3328e8d626eb5927c4237ea41269c811c9aed https://download.bt.cn/src/ngx_devel_kit-0.3.1.zip
fetch_checked nginx-dav-ext-module-3.0.0.tar.gz b750e396cf3024c34da9de7cdc7d8626c856f56f73e581358023f92fb45af092 https://download.bt.cn/src/nginx-dav-ext-module-3.0.0.tar.gz
fetch_checked ngx_http_substitutions_filter_module-master.zip 683b48a41660d9ff5c8b37996507c117a75b6254e3fff5510df2dc461ced5731 https://download.bt.cn/src/ngx_http_substitutions_filter_module-master.zip

for key in arut pluknet sb thresh; do
    curl --fail --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 60 --silent --show-error "https://nginx.org/keys/$key.key" -o "$stage/keys/$key.key"
done
curl --fail --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 60 --silent --show-error https://openssl-library.org/source/pubkeys.asc -o "$stage/keys/openssl.asc"
curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 90 --silent --show-error https://nginx.org/download/nginx-1.30.5.tar.gz.asc -o nginx-1.30.5.tar.gz.asc
curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 15 --max-time 90 --silent --show-error https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz.asc -o openssl-3.5.9.tar.gz.asc
mkdir -p "$stage/gnupg"
chmod 700 "$stage/gnupg"
gpg --homedir "$stage/gnupg" --batch --import "$stage"/keys/*.key "$stage/keys/openssl.asc" > "$stage/key-import.log" 2>&1
gpg --homedir "$stage/gnupg" --batch --with-colons --fingerprint B146647E45A7B33947AB226B2A2C87D161692D40 | grep -q 'fpr:::::::::B146647E45A7B33947AB226B2A2C87D161692D40:'
gpg --homedir "$stage/gnupg" --batch --status-fd 1 --verify nginx-1.30.5.tar.gz.asc nginx-1.30.5.tar.gz > "$stage/nginx-signature.log" 2>&1
gpg --homedir "$stage/gnupg" --batch --status-fd 1 --verify openssl-3.5.9.tar.gz.asc openssl-3.5.9.tar.gz > "$stage/openssl-signature.log" 2>&1
grep -q 'VALIDSIG.*B146647E45A7B33947AB226B2A2C87D161692D40' "$stage/openssl-signature.log"
printf 'Source digests and official source PGP signatures verified\n'

python3 - "$stage" <<'PY'
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile
import zipfile
root=Path(sys.argv[1]);destination=root/'source'
archives={'nginx-1.30.5.tar.gz':'nginx-1.30.5','openssl-3.5.9.tar.gz':'openssl-3.5.9',
          'ngx_cache_purge-2.3.tar.gz':'ngx_cache_purge-2.3',
          'nginx-sticky-module-ng-1.3.0.zip':'nginx-sticky-module-ng-1.3.0',
          'lua-nginx-module-0.10.24.zip':'lua-nginx-module-0.10.24',
          'ngx_devel_kit-0.3.1.zip':'ngx_devel_kit-0.3.1',
          'nginx-dav-ext-module-3.0.0.tar.gz':'nginx-dav-ext-module-3.0.0',
          'ngx_http_substitutions_filter_module-master.zip':'ngx_http_substitutions_filter_module-master'}
def check(name,expected):
    path=PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0]!=expected or '\\' in name:
        raise RuntimeError('Unsafe archive member: '+name)
    target=(destination/Path(*path.parts)).resolve()
    if os.path.commonpath([str(destination.resolve()),str(target)])!=str(destination.resolve()):
        raise RuntimeError('Archive escapes private source directory')
for archive,expected in archives.items():
    if (destination/expected).exists():
        continue
    file=root/'downloads'/archive
    if archive.endswith('.zip'):
        with zipfile.ZipFile(str(file)) as z:
            for item in z.infolist():
                check(item.filename,expected)
                if stat.S_ISLNK(item.external_attr>>16):raise RuntimeError('Archive symlink rejected')
            z.extractall(str(destination))
    else:
        with tarfile.open(str(file),'r:gz') as t:
            for item in t.getmembers():
                check(item.name,expected)
                if not (item.isdir() or item.isfile()):raise RuntimeError('Archive special member rejected')
            t.extractall(str(destination))
print('Safe private archive extraction complete')
PY

src="$stage/source"
export LUAJIT_LIB=/usr/local/lib
export LUAJIT_INC=/usr/local/include/luajit-2.1
export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
cd "$src/nginx-1.30.5"
printf 'Configuring retained modules, distribution-maintained PCRE1 and static OpenSSL 3.5.9\n'
if ! ./configure --user=www --group=www --prefix=/www/server/nginx \
    --add-module="$src/ngx_devel_kit-0.3.1" \
    --add-module="$src/lua-nginx-module-0.10.24" \
    --add-module="$src/ngx_cache_purge-2.3" \
    --add-module="$src/nginx-sticky-module-ng-1.3.0" \
    --without-pcre2 --with-openssl="$src/openssl-3.5.9" --with-openssl-opt=no-tests \
    --with-http_v2_module --with-stream --with-stream_ssl_module --with-stream_ssl_preread_module \
    --with-http_stub_status_module --with-http_ssl_module --with-http_image_filter_module \
    --with-http_gzip_static_module --with-http_gunzip_module --with-ipv6 --with-http_sub_module \
    --with-http_flv_module --with-http_addition_module --with-http_realip_module --with-http_mp4_module \
    --with-http_auth_request_module --add-module="$src/ngx_http_substitutions_filter_module-master" \
    --with-ld-opt='-Wl,-E -L/usr/local/lib -Wl,-rpath,/usr/local/lib -ljemalloc -Wl,-z,relro -Wl,-z,now' \
    --with-cc-opt='-Wno-error -fstack-protector-strong -D_FORTIFY_SOURCE=2' \
    --with-http_dav_module --add-module="$src/nginx-dav-ext-module-3.0.0" --with-http_v3_module \
    > "$stage/configure.log" 2>&1; then
    tail -n 80 "$stage/configure.log"
    exit 1
fi
printf 'Compiling with two jobs at nice priority; log %s\n' "$stage/make.log"
if ! nice -n 10 make -j2 > "$stage/make.log" 2>&1; then
    tail -n 90 "$stage/make.log"
    exit 1
fi
cp -p objs/nginx "$stage/candidate/nginx"
chmod 700 "$stage/candidate/nginx"
"$stage/candidate/nginx" -V > "$stage/candidate-version.txt" 2>&1
"$stage/candidate/nginx" -t -c /www/server/nginx/conf/nginx.conf > "$stage/candidate-config-test.txt" 2>&1
ldd "$stage/candidate/nginx" > "$stage/candidate-dependencies.txt"
sha256sum "$stage/candidate/nginx" > "$stage/candidate-sha256.txt"
production_after=$(sha256sum /www/server/nginx/sbin/nginx | awk '{print $1}')
test "$production_before" = "$production_after"
cat "$stage/candidate-version.txt"
cat "$stage/candidate-config-test.txt"
cat "$stage/candidate-sha256.txt"
printf 'Candidate ready: %s; production binary unchanged\n' "$stage/candidate/nginx"
