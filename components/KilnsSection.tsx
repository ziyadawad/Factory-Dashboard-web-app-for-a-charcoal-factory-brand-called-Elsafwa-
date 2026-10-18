"use client";

import { Kilns } from "@/lib/types";

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
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col">
      <h2 className="text-xl font-bold text-white mb-4">الأفران</h2>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-background rounded-xl p-3 text-center border border-statusGreen/30">
          <p className="text-3xl font-bold text-statusGreen">{data.working}</p>
          <p className="text-gray-400 text-xs">شغالة</p>
        </div>
        <div className="bg-background rounded-xl p-3 text-center border border-statusAmber/30">
          <p className="text-3xl font-bold text-statusAmber">{data.maintenance}</p>
          <p className="text-gray-400 text-xs">صيانة</p>
        </div>
        <div className="bg-background rounded-xl p-3 text-center border border-statusRed/30">
          <p className="text-3xl font-bold text-statusRed">{data.stopped}</p>
          <p className="text-gray-400 text-xs">متوقفة</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-2 w-full">
          {data.kilns.map((kiln) => (
            <div
              key={kiln.id}
              className={`${getStatusColor(
                kiln.status
              )} rounded-xl p-3 text-center shadow-lg`}
            >
              <p className="text-white font-bold text-sm">{kiln.name}</p>
              <p className="text-white/80 text-xs mt-1">
                {getStatusText(kiln.status)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 text-center">
        <p className="text-gray-400 text-sm">
          الإجمالي: <span className="text-white font-bold">{data.total}</span> أفران
        </p>
      </div>
    </div>
  );
}
