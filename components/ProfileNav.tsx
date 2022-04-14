import {signIn, signOut, useSession} from "next-auth/react";
import Image from "next/image";
import {useContext} from "react";
import Link from "next/link";
import {UserDataContext} from "./UserDataProvider";

export default function ProfileNav() {
  const {status} = useSession();
  const {user} = useContext(UserDataContext)

  if (status === "loading" || (status === 'authenticated' && !user)) {
    return <li tabIndex={0}>
      <a className="mx-1 flex flex-row">
        <span>Loading</span>
      </a>
    </li>
  }

  if (user) {
    return (
        <li tabIndex={0}>
          <a className="mx-1 flex flex-row">
            <div className="avatar">
              <Image width={28} height={28} className="rounded-full" src={user.avatar} alt=""/>
            </div>
            <span>{user.name}</span>
          </a>
          <ul className="p-2 bg-base-200 gap-1 left-0 top-full shadow-2xl z-20">
            <li><Link href="/account/settings"><a>Settings</a></Link></li>
            <li><Link href="/account/posts"><a>Posts</a></Link></li>
            <li><a onClick={() => signOut()}>Sign out</a></li>
          </ul>
        </li>
    )
  } else {
    return (
        <li>
          <a className="mx-1" onClick={() => signIn()}>Sign in</a>
        </li>
    )
  }
}
