import ProfileNav from "./ProfileNav";
import Link from "next/link";

export default function NavOptions() {
  return (
      <>
        <li><Link href="/"><a className="mx-1">Home</a></Link></li>
        <li><Link href="/post"><a className="mx-1">Post</a></Link></li>
        <ProfileNav/>
      </>
  )
}
