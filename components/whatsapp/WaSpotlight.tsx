"use client";

// كارت "رسالة جديدة" الكبير في نص الشاشة (زي كارت الطرحة): صورة الجروب واسمه وقسمه، الراسل والساعة، والرسايل نفسها
// (نص كامل، صور، ملفات، فويس) فقاعات فوق بعض. عداد رفيع تحت، والضغط بيفتح الشات، و✕ / Esc بيقفل بدري
// The big centered "new message" card (like the kiln exit card): group picture, name, section, sender, time and the
// messages themselves (full text, images, files, voice notes) as stacked bubbles. A thin countdown bar; clicking opens
// the chat, ✕ / Esc closes early

import { CSSProperties, useEffect, useState } from "react";
import { X } from "lucide-react";
import { WaMessage } from "@/lib/types";
import { WaSpotGroup, WaSpotShown } from "@/lib/wa-alert";
import { sectionOf } from "@/lib/wa-sections";
import { asWaGroup, cairoTime, fileSize, mediaUrl, senderColor, typePreview } from "./wa-common";
import { GroupAvatar } from "./WhatsAppPage";

const URL_RE = /https?:\/\/[^\s]+/gi;

// "0:23"
const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// فويس: المدة من الملف نفسه (metadata بس) - a voice note: its duration from the file (metadata only)
function Voice({ m }: { m: WaMessage }) {
  const [secs, setSecs] = useState<number | null>(null);
  const label = m.type === "voice" ? "🎤 فويس" : "🎵 صوت";
  return (
    <span className="inline-flex items-center gap-3 rounded-2xl bg-white/[0.07] border border-white/10 px-5 py-3 text-[26px] font-bold text-white">
      {label}
      {secs !== null && <span className="font-numbers text-gray-300">{duration(secs)}</span>}
      {m.media?.available && (
        <audio
          preload="metadata"
          src={mediaUrl(m.media.id)}
          className="hidden"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setSecs(d);
          }}
        />
      )}
    </span>
  );
}

function Images({ list }: { list: WaMessage[] }) {
  const h = list.length === 1 ? 380 : list.length === 2 ? 300 : 220;
  return (
    <div className="flex flex-wrap gap-3">
      {list.map((m) =>
        m.media?.available ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={m.id}
            src={mediaUrl(m.media.id)}
            alt=""
            className="rounded-2xl object-cover border border-white/10 bg-black/30"
            style={{ height: h, maxWidth: list.length === 1 ? "100%" : `calc(${100 / Math.min(list.length, 3)}% - 8px)` }}
          />
        ) : (
          <span key={m.id} className="rounded-2xl bg-white/[0.07] px-5 py-3 text-[24px] text-gray-300">
            {typePreview(m.type)}
          </span>
        )
      )}
    </div>
  );
}

function TextBubble({ text, size }: { text: string; size: number }) {
  const links = Array.from(new Set(text.match(URL_RE) ?? []));
  return (
    <div className="flex flex-col gap-2">
      <p dir="auto" className="whitespace-pre-wrap break-words text-white font-semibold leading-[1.55]" style={{ fontSize: size }}>
        {text}
      </p>
      {links.slice(0, 2).map((link) => {
        let host = link;
        try {
          const u = new URL(link);
          host = `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`;
        } catch {}
        return (
          <span key={link} dir="ltr" className="self-start inline-flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-400/30 px-4 py-1.5 text-[18px] text-sky-300 font-semibold max-w-full truncate">
            🔗 {host}
          </span>
        );
      })}
    </div>
  );
}

// فقاعة: الصور المتتالية بتتجمع في صف واحد - bubbles; consecutive images share one row
function Bubbles({ messages }: { messages: WaMessage[] }) {
  const totalText = messages.reduce((n, m) => n + (m.text?.length ?? 0), 0);
  const size = totalText < 120 ? 34 : totalText < 300 ? 28 : totalText < 600 ? 23 : 20;
  const blocks: { key: string; images?: WaMessage[]; m?: WaMessage }[] = [];
  for (const m of messages) {
    const isImage = m.type === "image" || m.type === "sticker";
    const last = blocks[blocks.length - 1];
    if (isImage && last?.images) last.images.push(m);
    else if (isImage) blocks.push({ key: m.id, images: [m] });
    else blocks.push({ key: m.id, m });
  }
  return (
    <div className="flex flex-col gap-3 min-h-0">
      {blocks.map((b) => (
        <div key={b.key} className="rounded-2xl bg-white/[0.04] border border-white/[0.08] px-5 py-3 flex flex-col gap-3">
          {b.images ? (
            <>
              <Images list={b.images} />
              {b.images.map((m) => m.text && <TextBubble key={`t${m.id}`} text={m.text} size={size} />)}
            </>
          ) : (
            b.m && <Message m={b.m} size={size} />
          )}
        </div>
      ))}
    </div>
  );
}

function Message({ m, size }: { m: WaMessage; size: number }) {
  return (
    <>
      {m.reply && (
        <p dir="auto" className="border-s-4 border-white/25 ps-3 text-[18px] text-gray-400 line-clamp-2">
          <span className="font-bold text-gray-300">{m.reply.sender}: </span>
          {m.reply.text}
        </p>
      )}
      {(m.type === "voice" || m.type === "audio") && <Voice m={m} />}
      {m.type === "document" && (
        <span className="self-start inline-flex items-center gap-3 rounded-2xl bg-white/[0.07] border border-white/10 px-5 py-3 text-[24px] font-bold text-white max-w-full">
          <span className="text-[34px]">{m.media?.mime?.includes("pdf") || /\.pdf$/i.test(m.media?.fileName ?? "") ? "📕" : "📄"}</span>
          <span dir="auto" className="truncate">{m.media?.fileName || "ملف"}</span>
          {m.media?.size ? <span className="font-numbers text-[18px] text-gray-400 shrink-0">{fileSize(m.media.size)}</span> : null}
        </span>
      )}
      {m.type === "video" &&
        (m.media?.available ? (
          <video src={mediaUrl(m.media.id)} preload="metadata" muted playsInline className="rounded-2xl max-h-[320px] self-start bg-black/40" />
        ) : (
          <span className="text-[24px] text-gray-300">{typePreview("video")}</span>
        ))}
      {m.text && <TextBubble text={m.text} size={size} />}
    </>
  );
}

export default function WaSpotlight({
  spot,
  pending,
  onDismiss,
  onOpen,
}: {
  spot: WaSpotShown | null;
  pending: number;
  onDismiss: () => void;
  onOpen: (group: WaSpotGroup) => void;
}) {
  // الكارت بيخرج بحركة قبل ما اللي بعده يدخل - the card animates out before the next one comes in
  const [shown, setShown] = useState<WaSpotShown | null>(spot);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (spot?.card.key === shown?.card.key || !shown) {
      setShown(spot);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      setLeaving(false);
      setShown(spot);
    }, 300);
    return () => clearTimeout(timer);
  }, [spot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!spot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spot, onDismiss]);

  if (!shown) return null;
  const { card } = shown;
  const section = sectionOf(card.group);
  const color = section.color;
  const first = card.messages[0];
  const last = card.messages[card.messages.length - 1];
  const total = shown.endsAt - shown.startedAt;
  const remaining = Math.max(0, shown.endsAt - Date.now());

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 ${leaving ? "wa-spot-fade-out" : "wa-spot-fade-in"}`}
      onClick={onDismiss}
      role="alert"
    >
      <div
        key={card.key}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(card.group);
        }}
        title="اضغط لفتح الشات"
        className={`relative w-[min(1100px,94vw)] max-h-[88vh] cursor-pointer rounded-3xl border-2 bg-card flex flex-col overflow-hidden ${leaving ? "wa-spot-out" : "wa-spot-in"}`}
        style={{ "--c": color, borderColor: color } as CSSProperties}
      >
        {/* الهيدر - header */}
        <div className="shrink-0 flex items-center gap-4 px-7 pt-6 pb-4 border-b" style={{ borderColor: `${color}55`, background: `linear-gradient(180deg, ${color}2e, transparent)` }}>
          <GroupAvatar group={asWaGroup(card.group)} size={76} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 min-w-0">
              <p className="min-w-0 truncate text-[32px] font-extrabold text-white leading-[1.4]">{card.group.name}</p>
              <span className="shrink-0 rounded-full px-3 py-0.5 text-[16px] font-extrabold text-black" style={{ background: color }}>
                {section.icon} {section.title}
              </span>
            </div>
            <p className="text-[22px] font-bold truncate" style={{ color: senderColor(card.sender) }}>
              {card.sender || "—"}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-[24px] font-bold text-gray-200 whitespace-nowrap">
              {cairoTime(first.at)}
              {last.at !== first.at && cairoTime(last.at) !== cairoTime(first.at) && <> ← {cairoTime(last.at)}</>}
            </span>
            {card.messages.length > 1 && (
              <span className="text-[15px] text-gray-400">
                <span className="font-numbers">{card.messages.length}</span> رسايل
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="absolute top-3 end-3 p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X size={24} />
          </button>
        </div>

        {/* الرسايل - the messages */}
        <div className="min-h-0 flex-1 overflow-hidden px-7 py-5">
          <Bubbles messages={card.messages} />
        </div>

        {/* تحت: الطابور والتلميح - bottom: the queue and the hint */}
        <div className="shrink-0 flex items-center gap-3 px-7 pb-4 text-[16px]">
          <span className="text-gray-400">اضغط لفتح الشات</span>
          {pending > 0 && (
            <span className="ms-auto rounded-full px-3 py-0.5 font-extrabold text-black" style={{ background: color }}>
              +<span className="font-numbers">{pending}</span> في الطابور
            </span>
          )}
        </div>
        {/* العداد - the countdown bar */}
        <div className="shrink-0 h-[5px] bg-white/[0.06]">
          <div
            key={shown.endsAt}
            className="wa-spot-bar h-full origin-right"
            style={{ background: color, "--from": total > 0 ? remaining / total : 0, animationDuration: `${remaining}ms` } as CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
