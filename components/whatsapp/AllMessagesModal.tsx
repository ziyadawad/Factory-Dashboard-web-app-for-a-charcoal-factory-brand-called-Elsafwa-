"use client";

// Modal لعرض جميع الرسائل من كل الجروبات (ملخص الصباح)
// Modal to display all messages from all groups (morning summary)

import { useState, useEffect } from "react";
import { X, BookOpen, AlertTriangle, Clock } from "lucide-react";
import { WaMessage } from "@/lib/types";
import WaImage from "./WaImage";
import { cairoTime, shortWhen, typePreview } from "./wa-common";

type AllMessagesResponse = {
  groups: { id: string; name: string; pictureId: string | null }[];
  messages: WaMessage[];
};

export default function AllMessagesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<AllMessagesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("/api/wa/all?limitPerGroup=50")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch messages");
        return res.json() as Promise<AllMessagesResponse>;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-cardBorder rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-cardBorder">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brandOrange/20 flex items-center justify-center">
              <BookOpen size={20} className="text-brandOrange" />
            </div>
            <div>
              <h2 className="text-[20px] font-extrabold text-white">ملخص الصباح</h2>
              <p className="text-[13px] text-gray-400">جميع الرسائل من كل الجروبات</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-gray-400">
                <Clock size={20} className="animate-spin" />
                <span>جاري تحميل الرسائل...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <AlertTriangle size={48} className="text-statusAmber" />
              <p className="text-[18px] font-bold text-white">حدث خطأ</p>
              <p className="text-[14px] text-gray-400 max-w-md">{error}</p>
            </div>
          ) : !data || data.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <BookOpen size={48} className="text-gray-500" />
              <p className="text-[18px] font-bold text-white">مفيش رسائل</p>
              <p className="text-[14px] text-gray-400">لا توجد رسائل محفوظة حالياً</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="flex items-center gap-6 text-sm text-gray-400 pb-4 border-b border-cardBorder">
                <span>
                  <span className="font-numbers font-bold text-gray-200">{data.groups.length}</span> جروب
                </span>
                <span>
                  <span className="font-numbers font-bold text-gray-200">{data.messages.length}</span> رسالة
                </span>
              </div>

              {/* Messages */}
              <div className="space-y-4">
                {data.messages.map((msg) => {
                  const group = data.groups.find((g) => g.id === msg.groupId);
                  const groupName = group?.name || msg.groupId;
                  return (
                    <div
                      key={msg.id}
                      className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 hover:bg-white/[0.05] transition-colors"
                    >
                      {/* Header: Group + Time */}
                      <div className="flex items-center justify-between mb-2 gap-4">
                        <span className="text-[14px] font-bold text-brandOrange truncate">{groupName}</span>
                        <span className="shrink-0 text-[12px] text-gray-500 font-numbers">{shortWhen(msg.at)}</span>
                      </div>

                      {/* Sender */}
                      {msg.sender && (
                        <p className="text-[13px] font-bold text-gray-300 mb-1">{msg.sender}</p>
                      )}

                      {/* Content */}
                      {msg.type === "image" || msg.type === "sticker" ? (
                        <div className="mt-2">
                          {msg.media ? (
                            <WaImage mediaId={msg.media.id} compact retrySeconds={0} className="max-w-full max-h-[300px] rounded-lg object-cover" />
                          ) : (
                            <span className="text-gray-500 text-sm">{typePreview(msg.type)}</span>
                          )}
                        </div>
                      ) : msg.text ? (
                        <p className="text-[14px] text-gray-200 leading-relaxed" dir="auto">{msg.text}</p>
                      ) : (
                        <span className="text-gray-500 text-sm">{typePreview(msg.type)}</span>
                      )}

                      {/* Reply */}
                      {msg.reply && (
                        <div className="mt-2 bg-white/[0.05] rounded-lg p-2 border-l-2 border-brandOrange/50">
                          <p className="text-[12px] text-gray-400">رد على <span className="font-bold text-gray-300">{msg.reply.sender}</span>:</p>
                          <p className="text-[13px] text-gray-300 line-clamp-2" dir="auto">{msg.reply.text}</p>
                        </div>
                      )}

                      {/* Full time */}
                      <p className="mt-2 text-[11px] text-gray-600 font-numbers">{cairoTime(msg.at)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
