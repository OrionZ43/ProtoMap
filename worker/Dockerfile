# Debian, а не Alpine — специально.
# Официальный бинарник yt-dlp собран под glibc и на musl просто не запускается.
# На этом легко потерять вечер: контейнер собирается, а качалка молча падает.
FROM node:22-slim AS build

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build


FROM node:22-slim

# ffmpeg обязателен: YouTube отдаёт видео и звук раздельными потоками, и без
# него yt-dlp не склеит — получите ролик без звука. Это ремукс, не пережатие,
# процессор не грузит.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp ставится ПАКЕТОМ, а не одним бинарником с GitHub.
#
# Тот бинарник собран PyInstaller'ом и при каждом запуске распаковывает себя
# во временный каталог — замерено в этом контейнере, около пяти секунд на
# вызов. При скачивании короткого ролика, которое целиком занимало десять
# секунд, половина уходила ровно на это.
#
# Версия из образа — запасная. Рабочая ставится в том при старте: YouTube
# ломает yt-dlp чуть ли не еженедельно, и версия из образа через месяц
# перестанет качать.
# curl-cffi обязателен, а не «на всякий случай».
#
# TikTok проверяет TLS-отпечаток клиента и отдаёт мусор всему, что не похоже
# на настоящий браузер. yt-dlp умеет притворяться, но только с этой
# библиотекой; без неё он пишет в лог
# «attempting impersonation, but no impersonate target is available»
# и падает с «Unexpected response from webpage request» — сообщением,
# которое на настоящую причину не указывает совсем.
RUN pip install --no-cache-dir --break-system-packages "yt-dlp[default,curl-cffi]"

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/lib ./lib

# Тот же UID, что в docker-compose.yml. Каталоги на хосте должны принадлежать
# ему, иначе Permission denied вылезет не при старте, а на первой же ссылке.
USER 10001:10001

CMD ["node", "lib/index.js"]
