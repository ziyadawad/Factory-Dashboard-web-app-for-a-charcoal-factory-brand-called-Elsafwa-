"use client";

import { Attendance } from "@/lib/types";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useCountUp } from "@/lib/useCountUp";

interface AttendanceSectionProps {
  data: Attendance;
}

export default function AttendanceSection({ data }: AttendanceSectionProps) {
  const { count: presentCount } = useCountUp(data.present, 600);
  const { count: absentCount } = useCountUp(data.absent, 600);

  const chartData = [
    { name: "حاضر", value: data.present, color: "#22C55E" },
    { name: "غائب", value: data.absent, color: "#EF4444" },
  ];

  const presentPercentage = ((data.present / data.total) * 100).toFixed(0);

  return (
    <div className="bg-card border border-cardBorder rounded-2xl p-4 h-full flex flex-col">
      <h2 className="text-xl font-bold text-white mb-4">حضور الإدارة</h2>

      <div className="flex-1 flex items-center justify-center">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="text-center mb-4">
        <p className="text-4xl font-bold text-white">{presentPercentage}%</p>
        <p className="text-gray-400 text-sm">نسبة الحضور</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-background rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-statusGreen">{presentCount}</p>
          <p className="text-gray-400 text-xs">حاضر</p>
        </div>
        <div className="bg-background rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-statusRed">{absentCount}</p>
          <p className="text-gray-400 text-xs">غائب</p>
        </div>
      </div>

      {data.absentNames.length > 0 && (
        <div className="bg-background rounded-xl p-3">
          <p className="text-gray-400 text-xs mb-2">الغائبون:</p>
          <div className="space-y-1">
            {data.absentNames.slice(0, 5).map((name, index) => (
              <p key={index} className="text-white text-sm">
                {name}
              </p>
            ))}
            {data.absentNames.length > 5 && (
              <p className="text-gray-400 text-sm">
                +{data.absentNames.length - 5}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
