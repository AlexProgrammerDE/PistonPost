import { cloneElement, ReactElement, useState } from "react";
import copy from "copy-to-clipboard";

export default function CopyButton({
  text,
  children
}: {
  text: string;
  children: ReactElement<any, any>;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    copy(text);
    setCopied(true);
  };
  const handleMouseLeave = () => setTimeout(() => setCopied(false), 300);

  return (
    <span
      className="z-9999 tooltip"
      data-tip={copied ? "Copied!" : "Click to copy!"}
    >
      {cloneElement(children, {
        onClick: handleClick,
        onMouseLeave: handleMouseLeave
      })}
    </span>
  );
}
