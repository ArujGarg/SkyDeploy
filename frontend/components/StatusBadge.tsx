type Props = {
  status:
    | "QUEUED"
    | "CLONING"
    | "BUILDING"
    | "DEPLOYING"
    | "SUCCESS"
    | "FAILED";
};

const colors = {
  QUEUED: "bg-zinc-100 text-zinc-700 border border-zinc-200",

  CLONING: "bg-blue-50 text-blue-700 border border-blue-200",

  BUILDING: "bg-amber-50 text-amber-700 border border-amber-200",

  DEPLOYING: "bg-purple-50 text-purple-700 border border-purple-200",

  SUCCESS: "bg-green-50 text-green-700 border border-green-200",

  FAILED: "bg-red-50 text-red-700 border border-red-200",
};

export default function StatusBadge({ status }: Props) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[status]}`}
    >
      {status}
    </span>
  );
}
