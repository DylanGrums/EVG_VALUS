import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getDb } from "@/db";
import type { PracticalInfo } from "@/db/schema";
import { Card, Hero, LinkButton, Shell, cx } from "@/components/ui";
import { requireMemberPage } from "@/lib/orga/auth";
import { loadCarnet, type CarnetEvent, type CarnetItem } from "@/lib/orga/carnet";
import { INFO_CATEGORY_LABELS, formatDateTime, formatDay, formatEuros, formatTime, linkLabel, mapsUrl, telHref } from "@/lib/orga/format";
import { DateRange } from "../../_components/views";

export const metadata: Metadata = { title: "Sur place" };

/** Carnet de voyage (phase B) : uniquement ce qui a été retenu, lisible vite sur téléphone. */
export default async function SurPlace() {
  await requireMemberPage();
  const carnet = await loadCarnet(await getDb());
  const destination = carnet.destinations.map((d) => d.title).join(" + ");

  return (
    <Shell>
      <Hero kicker="Carnet de voyage" title={destination ? `Cap sur ${destination} 🧳` : "Le carnet sur place 🧳"}>
        {carnet.isEmpty ? "Rien n’est encore validé. Le carnet se remplira au fur et à mesure des décisions." : "Tout ce qui est validé, au même endroit. Garde cette page sous la main !"}
      </Hero>

      {!carnet.isEmpty && (
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm font-semibold" aria-label="Sections du carnet">
          {[
            carnet.logements.length && ["#logement", "🏠 Logement"],
            carnet.planning.length && ["#planning", "🗓️ Planning"],
            carnet.activites.length && ["#activites", "🎯 Activités"],
            carnet.transports.length && ["#transport", "🚆 Transport"],
            carnet.infos.length && ["#infos", "ℹ️ Infos"],
          ]
            .filter((x): x is [string, string] => Array.isArray(x))
            .map(([href, label]) => (
              <a key={href} href={href} className="shrink-0 rounded-full border border-line bg-panel px-3.5 py-2 hover:border-brand">
                {label}
              </a>
            ))}
        </nav>
      )}

      {carnet.logements.length > 0 && (
        <Section id="logement" title="🏠 Logement">
          {carnet.logements.map((l) => (
            <Card key={l.id} className="space-y-3">
              <h3 className="text-xl">{l.title}</h3>
              {l.address && <AddressBlock address={l.address} />}
              <div className="grid grid-cols-2 gap-2">
                <TimeTile label="Check-in" value={l.startsAt} />
                <TimeTile label="Check-out" value={l.endsAt} />
              </div>
              <ItemExtras item={l} />
              {l.price.perPerson != null && <p className="text-sm text-muted">{formatEuros(l.price.perPerson)} / pers.</p>}
            </Card>
          ))}
        </Section>
      )}

      {carnet.planning.length > 0 && (
        <Section id="planning" title="🗓️ Planning">
          <div className="space-y-4">
            {carnet.planning.map((day) => (
              <Card key={day.day} className="p-4 sm:p-5">
                <h3 className="mb-3 text-lg capitalize">{formatDay(day.day)}</h3>
                <ol className="space-y-3 border-l-2 border-brand-light pl-4">
                  {day.events.map((e, i) => (
                    <PlanningEvent key={`${e.refId}-${e.label}-${i}`} event={e} />
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {carnet.activites.length > 0 && (
        <Section id="activites" title="🎯 Activités">
          {carnet.activites.map((a) => (
            <Card key={a.id} className="space-y-2 p-4 sm:p-5">
              <h3 className="text-lg">{a.title}</h3>
              <ItemBody item={a} />
            </Card>
          ))}
        </Section>
      )}

      {carnet.transports.length > 0 && (
        <Section id="transport" title="🚆 Transport & billets">
          {carnet.transports.map((t) => (
            <Card key={t.id} className="space-y-2 p-4 sm:p-5">
              <h3 className="text-lg">{t.title}</h3>
              <ItemBody item={t} />
            </Card>
          ))}
        </Section>
      )}

      {carnet.infos.length > 0 && (
        <Section id="infos" title="ℹ️ Infos pratiques">
          {carnet.infos.map((group) => (
            <div key={group.category} className="space-y-2">
              <h3 className="text-sm font-extrabold uppercase tracking-widest text-muted">{INFO_CATEGORY_LABELS[group.category]}</h3>
              {group.items.map((info) => (
                <InfoCard key={info.id} info={info} />
              ))}
            </div>
          ))}
        </Section>
      )}
    </Shell>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-3">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function AddressBlock({ address }: { address: string }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">📍 {address}</p>
      <a href={mapsUrl(address)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 font-bold text-white">
        Itinéraire Google Maps ↗
      </a>
    </div>
  );
}

function TimeTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-semibold">{value ? formatDateTime(value) : "—"}</p>
    </div>
  );
}

function ItemExtras({ item }: { item: CarnetItem }) {
  return (
    <>
      {item.openingHours && <p className="text-sm">⏰ {item.openingHours}</p>}
      {item.practicalNotes && <p className="whitespace-pre-line rounded-xl bg-lime/60 p-3 text-sm">{item.practicalNotes}</p>}
      {item.url && (
        <LinkButton href={item.url} target="_blank" rel="noopener noreferrer" variant="secondary" className="w-full sm:w-auto">
          🔗 {linkLabel(item.url)}
        </LinkButton>
      )}
    </>
  );
}

function ItemBody({ item }: { item: CarnetItem }) {
  return (
    <>
      {(item.startsAt || item.endsAt) && (
        <p className="text-sm font-semibold">
          <DateRange type={item.topicType} startsAt={item.startsAt} endsAt={item.endsAt} />
        </p>
      )}
      {item.address && (
        <p className="text-sm">
          📍 {item.address} ·{" "}
          <a className="font-semibold text-brand underline" href={mapsUrl(item.address)} target="_blank" rel="noopener noreferrer">
            Maps ↗
          </a>
        </p>
      )}
      {item.description && <p className="whitespace-pre-line text-sm text-muted">{item.description}</p>}
      <ItemExtras item={item} />
    </>
  );
}

const EVENT_DOT: Record<CarnetEvent["kind"], string> = {
  destination: "bg-brand",
  logement: "bg-ok",
  activites: "bg-brand",
  transport: "bg-night",
  autre: "bg-brand",
  info: "bg-muted",
};

function PlanningEvent({ event }: { event: CarnetEvent }) {
  return (
    <li className="relative">
      <span className={cx("absolute -left-[1.4rem] top-1.5 size-3 rounded-full ring-4 ring-panel", EVENT_DOT[event.kind])} aria-hidden />
      <p className="text-sm font-extrabold text-brand">
        {formatTime(event.at)}
        {event.until && ` – ${formatTime(event.until)}`}
        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted">{event.label}</span>
      </p>
      <p className="font-semibold">{event.title}</p>
      {event.address && (
        <a href={mapsUrl(event.address)} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline">
          📍 {event.address}
        </a>
      )}
    </li>
  );
}

function InfoCard({ info }: { info: PracticalInfo }) {
  return (
    <Card className="space-y-2 p-4">
      <h4 className="text-lg">{info.title}</h4>
      {info.at && <p className="text-sm font-semibold">🕑 {formatDateTime(info.at)}</p>}
      {info.body && <p className="whitespace-pre-line text-sm">{info.body}</p>}
      <div className="flex flex-wrap gap-2">
        {info.phone && (
          <a href={telHref(info.phone)} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white">
            📞 {info.phone}
          </a>
        )}
        {info.address && (
          <a href={mapsUrl(info.address)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold">
            📍 {info.address}
          </a>
        )}
        {info.url && (
          <a href={info.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-brand">
            🔗 {linkLabel(info.url)}
          </a>
        )}
      </div>
    </Card>
  );
}
