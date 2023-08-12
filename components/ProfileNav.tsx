import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { useContext } from "react";
import Link from "next/link";
import { UserDataContext } from "./UserDataProvider";

export default function ProfileNav() {
  const { status } = useSession();
  const { user } = useContext(UserDataContext);

  if (status === "loading" || (status === "authenticated" && !user)) {
    return (
      <li>
        <a className="mx-1 flex flex-row">
          <span>Loading</span>
        </a>
      </li>
    );
  }

  if (user) {
    return (
      <li>
        <details>
          <summary>
            <div className="avatar">
              <Image
                width={28}
                height={28}
                className="rounded-full"
                src={user.avatar}
                alt={`Avatar of ${user.name}`}
              />
            </div>
            <span>{user.name}</span>
          </summary>
          <ul className="bg-base-200 z-50">
            <li>
              <Link href="/account/settings">
                Settings
              </Link>
            </li>
            <li>
              <Link href="/account/posts">
                Posts
              </Link>
            </li>
            <li>
              <a onClick={() => signOut()}>Sign out</a>
            </li>
          </ul>
        </details>
      </li>
    );
  } else {
    return (
      <li>
        <a className="mx-1" onClick={() => signIn()}>
          Sign in
        </a>
      </li>
    );
  }
}
