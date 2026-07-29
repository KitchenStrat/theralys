"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PROFESSION_CATEGORIES } from "@theralys/shared";
import { Badge, Button, FieldHint, Input, Label, Modal, Select, Spinner } from "@theralys/ui";
import { createDemo, searchGooglePlaces } from "./actions";
import type { PlaceResult } from "@/lib/places";

export function NewDemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fiche Google (optionnel)
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Motifs à mettre en avant (tags libres)
  const [motifs, setMotifs] = useState<string[]>([]);
  const [motifInput, setMotifInput] = useState("");

  function onPlaceQueryChange(value: string) {
    setPlaceQuery(value);
    setSelectedPlace(null);
    clearTimeout(searchTimer.current);
    if (value.trim().length < 3) {
      setPlaceResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      setSearching(true);
      searchGooglePlaces(value)
        .then(setPlaceResults)
        .finally(() => setSearching(false));
    }, 350);
  }

  function addMotif() {
    const value = motifInput.trim();
    if (!value || motifs.includes(value) || motifs.length >= 12) return;
    setMotifs([...motifs, value]);
    setMotifInput("");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const result = await createDemo({
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      profession: form.get("profession"),
      city: form.get("city"),
      gender: form.get("gender"),
      language: "fr",
      highlightedMotifs: motifs,
      bookingUrl: form.get("bookingUrl") ?? "",
      validityDays: form.get("validityDays") || 30,
      googlePlace: selectedPlace,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    setMotifs([]);
    setPlaceQuery("");
    setSelectedPlace(null);
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Créer une démo" wide>
      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset>
          <Label htmlFor="placeQuery">Fiche Google (optionnel)</Label>
          <Input
            id="placeQuery"
            placeholder="Rechercher le cabinet sur Google…"
            value={selectedPlace ? selectedPlace.name : placeQuery}
            onChange={(e) => onPlaceQueryChange(e.target.value)}
            autoComplete="off"
          />
          <FieldHint>
            L&apos;enrichissement (avis, adresse, photos, horaires) se fait pendant la préparation.
          </FieldHint>
          {searching ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-500">
              <Spinner /> Recherche…
            </p>
          ) : null}
          {!selectedPlace && placeResults.length > 0 ? (
            <ul className="mt-2 overflow-hidden rounded-xl border border-cream-300">
              {placeResults.map((place) => (
                <li key={place.placeId}>
                  <button
                    type="button"
                    onClick={() => setSelectedPlace(place)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-cream-100"
                  >
                    <span>
                      <span className="font-medium">{place.name}</span>
                      <span className="block text-xs text-ink-500">{place.address}</span>
                    </span>
                    <Badge tone="primary">
                      ★ {place.rating} · {place.reviewCount} avis
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {selectedPlace ? (
            <p className="mt-2 flex items-center gap-2 text-sm">
              <Badge tone="success">Fiche sélectionnée</Badge>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlace(null);
                  setPlaceQuery("");
                }}
                className="text-xs text-ink-500 underline"
              >
                Retirer
              </button>
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">Prénom *</Label>
            <Input id="firstName" name="firstName" required />
          </div>
          <div>
            <Label htmlFor="lastName">Nom *</Label>
            <Input id="lastName" name="lastName" required />
          </div>
          <div>
            <Label htmlFor="profession">Métier *</Label>
            <Select id="profession" name="profession" defaultValue="" required>
              <option value="" disabled>
                Choisir un métier…
              </option>
              {PROFESSION_CATEGORIES.map((category) => (
                <optgroup key={category.label} label={category.label}>
                  {category.professions.map((profession) => (
                    <option key={profession} value={profession}>
                      {profession}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <FieldHint>Tout le contenu généré s&apos;adapte au métier choisi.</FieldHint>
          </div>
          <div>
            <Label htmlFor="city">Ville *</Label>
            <Input id="city" name="city" placeholder="ex. Albi" required />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="gender">Genre * </Label>
            <Select id="gender" name="gender" defaultValue="feminin" required>
              <option value="feminin">Féminin</option>
              <option value="masculin">Masculin</option>
            </Select>
            <FieldHint>Utilisé pour les accords grammaticaux du contenu.</FieldHint>
          </div>
          <div>
            <Label htmlFor="language">Langue du site public</Label>
            <Select id="language" name="language" defaultValue="fr">
              <option value="fr">Français</option>
            </Select>
            <FieldHint>Seule option active pour l&apos;instant.</FieldHint>
          </div>
        </div>

        <fieldset>
          <Label htmlFor="motifInput">Motifs à mettre en avant (optionnel)</Label>
          <div className="flex gap-2">
            <Input
              id="motifInput"
              placeholder="ex. Gestion du stress"
              value={motifInput}
              onChange={(e) => setMotifInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMotif();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addMotif}>
              Ajouter
            </Button>
          </div>
          <FieldHint>Générés en priorité sur l&apos;accueil et les pages dédiées.</FieldHint>
          {motifs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {motifs.map((motif) => (
                <Badge key={motif} tone="primary">
                  {motif}
                  <button
                    type="button"
                    aria-label={`Retirer ${motif}`}
                    onClick={() => setMotifs(motifs.filter((m) => m !== motif))}
                    className="ml-1 opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bookingUrl">Lien de prise de RDV (optionnel)</Label>
            <Input id="bookingUrl" name="bookingUrl" placeholder="https://calendly.com/… ou tel:…" />
          </div>
          <div>
            <Label htmlFor="validityDays">Validité du lien (jours)</Label>
            <Input
              id="validityDays"
              name="validityDays"
              type="number"
              min={1}
              max={365}
              defaultValue={30}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-danger-500">{error}</p> : null}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Création…" : "Créer la démo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
