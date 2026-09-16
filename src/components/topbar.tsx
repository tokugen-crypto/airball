import Link from "next/link";

/** Instagram's white bar: hairline rule underneath, wordmark centred. */
export default function TopBar({
  left,
  right,
  title,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  title?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card">
      <div className="mx-auto flex h-[54px] max-w-[614px] items-center justify-between px-4">
        <div className="flex w-20 items-center justify-start">{left}</div>
        <div className="min-w-0 text-center">
          {title ?? (
            <Link href="/" className="font-script text-3xl leading-none">
              Airball
            </Link>
          )}
        </div>
        <div className="flex w-20 items-center justify-end gap-4">{right}</div>
      </div>
    </header>
  );
}
