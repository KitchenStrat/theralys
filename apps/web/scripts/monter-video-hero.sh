#!/bin/bash
# Monte la vidéo de fond du haut de page : des praticiens au travail, cinq scènes à la suite, en boucle.
#   1. une séance en cabinet : la thérapeute s'installe face à un couple, qui sourit (Pexels 4098445 et 4098435)
#   2. une professeure de yoga souriante, au jardin (Coverr « communication with a yoga teacher » et « brunette woman smiling »)
#   3. un massage du dos, lumière tamisée (Mixkit 4744)
#   4. la praticienne à son bureau : ordinateur, puis carnet (Mixkit 4957 et 4937)
#   5. le yoga seul, le soleil sur le mur (Mixkit 887)
# Les plans s'enchaînent en fondu, et le dernier se fond dans le premier : la boucle n'a pas de coupure.
# Chaque plan est relu à 25 images par seconde, image pour image (les plans tournés à 24 sont à peine accélérés,
# celui tourné à 30 un peu ralenti) : aucune saccade. Les hautes lumières sont plafonnées pour que le titre blanc
# reste lisible par-dessus, même sur les murs clairs du cabinet.
# Usage : bash scripts/monter-video-hero.sh <dossier des sources> <dossier de sortie>
# Sources attendues, en 1080p : pexels-4098445.mp4, pexels-4098435.mp4 (2048x1080), coverr-9000.mp4, coverr-2053.mp4,
# mixkit-4744.mp4, mixkit-4957.mp4, mixkit-4937.mp4, mixkit-887.mp4
set -euo pipefail
SRC="$1"; OUT="$2"
mkdir -p "$OUT"

# Durée du fondu entre deux plans, en secondes
FADE=0.9
# Un plan par ligne : fichier, début dans la source (s), durée à l'écran (s), cadence de la source, plafond des hautes lumières
PLANS=(
  "pexels-4098445.mp4 10.4 4.6 25     0.70"
  "pexels-4098435.mp4 3.6  3.6 25     0.70"
  "coverr-9000.mp4    3.0  3.6 23.976 0.72"
  "coverr-2053.mp4    3.0  3.4 23.976 0.72"
  "mixkit-4744.mp4    0.4  4.6 29.97  0.74"
  "mixkit-4957.mp4    2.0  3.6 23.976 0.72"
  "mixkit-4937.mp4    0.0  3.0 23.976 0.72"
  "mixkit-887.mp4     1.4  4.6 23.976 0.72"
)

INPUTS=()
GRAPH=""
DURATIONS=()
COUNT=${#PLANS[@]}
for i in "${!PLANS[@]}"; do
  read -r file start duration rate ceiling <<<"${PLANS[$i]}"
  INPUTS+=(-i "$SRC/$file")
  DURATIONS+=("$duration")
  # Fenêtre lue dans la source : la durée à l'écran, ramenée à la cadence d'origine, plus une demi-seconde de marge
  window=$(awk -v d="$duration" -v r="$rate" 'BEGIN { printf "%.3f", d * 25 / r + 0.5 }')
  chain="[$i:v]trim=start=$start:duration=$window,setpts=N/(25*TB),fps=25,trim=0:$duration,setpts=PTS-STARTPTS"
  chain+=",scale=-2:1080,crop=1920:1080,curves=all='0/0 0.5/0.4 1/$ceiling',eq=saturation=0.95,format=yuv420p"
  # Le premier plan sert deux fois : il ouvre la boucle et la referme
  if [ "$i" -eq 0 ]; then GRAPH+="$chain,split[p0][loop];"; else GRAPH+="$chain[p$i];"; fi
done

# Fondus enchaînés : p0 → p1 → … → dernier → p0
offset=0
previous="p0"
total=0
for i in $(seq 1 "$COUNT"); do
  last=$((i - 1))
  offset=$(awk -v o="$offset" -v d="${DURATIONS[$last]}" -v f="$FADE" 'BEGIN { printf "%.3f", o + d - f }')
  total=$offset
  if [ "$i" -lt "$COUNT" ]; then next="p$i"; else next="loop"; fi
  GRAPH+="[$previous][$next]xfade=transition=fade:duration=$FADE:offset=$offset[x$i];"
  previous="x$i"
done
# La boucle : de la fin du premier fondu d'ouverture à son retour, une fois tous les plans passés
GRAPH+="[$previous]trim=$FADE:$(awk -v t="$total" -v f="$FADE" 'BEGIN { printf "%.3f", t + f }'),setpts=PTS-STARTPTS,split[v1][v2];[v2]scale=1280:720[v720]"

ffmpeg -v error -y "${INPUTS[@]}" -filter_complex "$GRAPH" \
  -map "[v1]" -an -c:v libx264 -preset slow -crf 28 -profile:v high -pix_fmt yuv420p -g 50 -movflags +faststart "$OUT/hero-1080.mp4" \
  -map "[v720]" -an -c:v libx264 -preset slow -crf 29 -profile:v high -pix_fmt yuv420p -g 50 -movflags +faststart "$OUT/hero-720.mp4"
# Image d'attente : la première image de la boucle, affichée avant la vidéo (et seule en mouvement réduit)
ffmpeg -v error -y -i "$OUT/hero-1080.mp4" -frames:v 1 -q:v 3 "$OUT/hero-poster.jpg"
for f in hero-1080.mp4 hero-720.mp4; do
  printf "%s : " "$f"; ffprobe -v error -select_streams v:0 -show_entries stream=width,height:format=duration,size -of default=nw=1 "$OUT/$f" | tr "\n" " "; echo
done
ls -la "$OUT" | awk '{print $5, $9}'
