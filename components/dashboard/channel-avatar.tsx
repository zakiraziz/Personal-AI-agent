import Image from "next/image";

export function ChannelAvatar({
  name,
  thumbnailUrl,
  size = 40,
}: {
  name: string;
  thumbnailUrl: string | null;
  size?: number;
}) {
  if (thumbnailUrl) {
    return (
      <Image
        src={thumbnailUrl}
        alt={`${name} channel avatar`}
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${name} channel avatar`}
      className="flex shrink-0 items-center justify-center rounded-full bg-violet-400/15 font-semibold text-violet-200"
      style={{ width: size, height: size, fontSize: Math.max(12, size / 2.5) }}
    >
      {name.trim().charAt(0).toUpperCase() || "Y"}
    </span>
  );
}
