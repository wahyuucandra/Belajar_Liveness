export default function ProgressBar({ value }: { value: number }) {
    return (
      <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${value}%` }} />
      </div>
    );
  }
  