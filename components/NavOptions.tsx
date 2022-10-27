import ProfileNav from "./ProfileNav";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function NavOptions() {
  const { status } = useSession();

  return <>
    <li>
      <Link href="/" className="mx-1">
        Home
      </Link>
    </li>
    {status === "authenticated" && (
      <li>
        <Link href="/account/post" className="mx-1">
          Post
        </Link>
      </li>
    )}
    <ProfileNav />
  </>;
}
