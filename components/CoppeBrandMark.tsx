import Image from "next/image";

import { classNames } from "../lib/utils";

type CoppeBrandMarkProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function CoppeBrandMark({
  size = 40,
  className,
  priority = false,
}: CoppeBrandMarkProps) {
  return (
    <Image
      src="/coppe-icon.png"
      alt="COPPE"
      width={size}
      height={size}
      priority={priority}
      className={classNames(
        "shrink-0 rounded-[24%] object-contain drop-shadow-sm",
        className
      )}
    />
  );
}
