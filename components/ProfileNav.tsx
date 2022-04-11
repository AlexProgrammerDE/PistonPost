import {signIn, useSession} from "next-auth/react";
import Image from "next/image";
import axios from "../lib/axios";
import {useEffect, useState} from "react";

interface UserData {
  name: string;
  avatar: string;
}

export default function ProfileNav() {
  // https://www.gravatar.com/avatar/00000000000000000000000000000000?d=retro
  const {data: session, status} = useSession()
  const [user, setUser] = useState<UserData>()

  useEffect(() => {
    if (session && !user) {
      axios.get("/userdata").then(res => {
        setUser({
          name: res.data.name,
          avatar: res.data.avatar
        })
      })
    }
  }, [session, user])

  if (user) {
    return (
        <li>
          <a className="mx-1 flex flex-row">
            <Image width={32} height={32} className="rounded-box h-8 w-8" src={user?.avatar!} alt=""/>
            <span className="ml-1">{user?.name}</span>
          </a>
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
