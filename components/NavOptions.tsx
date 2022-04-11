import { signIn } from "next-auth/react"
import ProfileNav from "./ProfileNav";

export default function NavOptions() {
  return (
      <>
        <li><a className="mx-1">Home</a></li>
        <li><a className="mx-1">Post</a></li>
        <ProfileNav/>
      </>
  )
}
