import ProfileNav from "./ProfileNav";
import Link from "next/link";
import {useSession} from "next-auth/react";

export default function NavOptions() {
  const {status} = useSession()

  return (
      <>
        <li><Link href="/"><a className="mx-1">Home</a></Link></li>
        {status === "authenticated" && <li><Link href="/account/post"><a className="mx-1">Post</a></Link></li>}
        <ProfileNav/>
      </>
  )
}
