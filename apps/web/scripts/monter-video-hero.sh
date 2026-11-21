#!/bin/bash
# Monte la vidéo de fond du haut de page à partir de deux plans de banque d'images (Pexels) :
# A, une marche dans une forêt de pins, dans la brume et les rayons du matin ; B, une main qui effleure les blés.
# Les deux plans s'enchaînent en fondu, et la fin se fond dans le début : la boucle n'a pas de coupure.
# Le plan A, tourné à 30 images par seconde, est lu à 25 : un léger ralenti, sans saccade.
# Les hautes lumières sont adoucies pour que le titre blanc reste lisible par-dessus.
# Usage : bash scripts/monter-video-hero.sh <dossier des sources> <dossier de sortie>
# (les sources : a.mp4 = vidéo Pexels 5841958 en 2048x1080, b.mp4 = vidéo Pexels 5098636 en 1080p)
SRC="$1"; OUT="$2"
mkdir -p "$OUT"
GRAPH="
[0:v]trim=18.5:26,setpts=(PTS-STARTPTS)*1.2,fps=25,trim=0:9,setpts=PTS-STARTPTS,scale=-2:1080,crop=1920:1080,curves=all='0/0 0.5/0.4 1/0.72',eq=saturation=0.96,format=yuv420p,split[a1][a2];
[1:v]trim=2.2:11.2,setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25,curves=all='0/0 0.5/0.4 1/0.74',eq=saturation=0.92,format=yuv420p[b];
[a1][b]xfade=transition=fade:duration=1.2:offset=7.8[ab];
[ab][a2]xfade=transition=fade:duration=1.2:offset=15.6[full];
[full]trim=1.2:16.8,setpts=PTS-STARTPTS,split[v1][v2];
[v2]scale=1280:720[v720]"
ffmpeg -v error -y -i "$SRC/a.mp4" -i "$SRC/b.mp4" -filter_complex "$GRAPH" \
  -map "[v1]" -an -c:v libx264 -preset slow -crf 31 -profile:v high -pix_fmt yuv420p -g 50 -movflags +faststart "$OUT/hero-1080.mp4" \
  -map "[v720]" -an -c:v libx264 -preset slow -crf 32 -profile:v high -pix_fmt yuv420p -g 50 -movflags +faststart "$OUT/hero-720.mp4"
# Image d'attente : la première image de la boucle, affichée avant la vidéo (et seule en mouvement réduit)
ffmpeg -v error -y -i "$OUT/hero-1080.mp4" -frames:v 1 -q:v 3 "$OUT/hero-poster.jpg"
for f in hero-1080.mp4 hero-720.mp4; do
  printf "%s : " "$f"; ffprobe -v error -select_streams v:0 -show_entries stream=width,height:format=duration,size -of default=nw=1 "$OUT/$f" | tr "\n" " "; echo
done
ls -la "$OUT" | awk '{print $5, $9}'
