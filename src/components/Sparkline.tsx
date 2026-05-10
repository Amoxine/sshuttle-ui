import { useId, useMemo } from "react";

export interface SparklinePoint {
  in: number;
  out: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  height?: number;
  className?: string;
  /** Used as the aria-label */
  ariaLabel?: string;
}

const COLOR_IN = "#3b82f6";
const COLOR_OUT = "#10b981";

export function Sparkline({
  data,
  height = 112,
  className,
  ariaLabel = "Throughput over time",
}: SparklineProps) {
  const rawId = useId();
  const idBase = rawId.replace(/:/g, "");
  const inGrad = `${idBase}-in`;
  const outGrad = `${idBase}-out`;

  const paths = useMemo(() => {
    if (data.length < 2) return null;
    const maxValue = Math.max(...data.flatMap((p) => [p.in, p.out]), 1);
    const denom = data.length - 1;
    const build = (key: "in" | "out") => {
      const segs: string[] = [];
      for (let i = 0; i < data.length; i++) {
        const x = (i / denom) * 100;
        const y = height - (data[i][key] / maxValue) * height;
        segs.push(`${i === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`);
      }
      const line = segs.join(" ");
      const area = `M0 ${height} ${line.replace(/^M/, "L")} L100 ${height} Z`;
      return { line, area };
    };
    return { in: build("in"), out: build("out") };
  }, [data, height]);

  if (!paths) {
    return (
      <div
        className={className}
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        <div className="flex h-full items-center justify-center text-xs text-ink-500">
          Waiting for samples…
        </div>
      </div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={inGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLOR_IN} stopOpacity={0.55} />
          <stop offset="100%" stopColor={COLOR_IN} stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id={outGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLOR_OUT} stopOpacity={0.55} />
          <stop offset="100%" stopColor={COLOR_OUT} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <path d={paths.in.area} fill={`url(#${inGrad})`} stroke="none" />
      <path
        d={paths.in.line}
        fill="none"
        stroke={COLOR_IN}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path d={paths.out.area} fill={`url(#${outGrad})`} stroke="none" />
      <path
        d={paths.out.line}
        fill="none"
        stroke={COLOR_OUT}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
