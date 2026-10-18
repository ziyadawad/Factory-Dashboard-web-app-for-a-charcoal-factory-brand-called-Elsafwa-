"use client";

import { Kilns } from "@/lib/types";
import { formatNumber, toEnglishDigits } from "@/lib/format";

interface KilnsSectionProps {
  data: Kilns;
}

export default function KilnsSection({ data }: KilnsSectionProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "working":
        return "bg-statusGreen";
      case "maintenance":
        return "bg-statusAmber";
      case "stopped":
        return "bg-statusRed";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "working":
        return "شغالة";
      case "maintenance":
        return "صيانة";
      case "stopped":
        return "متوقفة";
      default:
        return status;
    }
  };

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-2 shrink-0">الأفران</h2>

      <div className="grid grid-cols-3 gap-2 mb-2 shrink-0">
        <div className="bg-background rounded-xl py-2 text-center border border-statusGreen/30">
          <p className="text-3xl font-bold text-statusGreen tabular-nums">{formatNumber(data.working)}</p>
          <p className="text-gray-400 text-xs">شغالة</p>
        </div>
        <div className="bg-background rounded-xl py-2 text-center border border-statusAmber/30">
          <p className="text-3xl font-bold text-statusAmber tabular-nums">{formatNumber(data.maintenance)}</p>
          <p className="text-gray-400 text-xs">صيانة</p>
        </div>
        <div className="bg-background rounded-xl py-2 text-center border border-statusRed/30">
          <p className="text-3xl font-bold text-statusRed tabular-nums">{formatNumber(data.stopped)}</p>
          <p className="text-gray-400 text-xs">متوقفة</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div className="grid grid-cols-3 gap-2 w-full">
          {data.kilns.map((kiln) => (
            <div
              key={kiln.id}
              className={`${getStatusColor(
                kiln.status
              )} rounded-xl p-2 text-center shadow-lg`}
            >
              <p className="text-white font-bold text-sm">{toEnglishDigits(kiln.name)}</p>
              <p className="text-white/80 text-xs mt-0.5">
                {getStatusText(kiln.status)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 text-center shrink-0">
        <p className="text-gray-400 text-sm">
          الإجمالي: <span className="text-white font-bold">{formatNumber(data.total)}</span> أفران
        </p>
      </div>
    </div>
  );
}
