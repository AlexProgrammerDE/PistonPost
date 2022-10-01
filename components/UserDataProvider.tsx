import { createContext, ReactNode } from "react";
import { UserData } from "lib/responses";
import { useSession } from "next-auth/react";
import useSWR from "swr";

export const UserDataContext = createContext({
  user: null as unknown as UserData | undefined
});

export default function UserDataProvider({
  children
}: {
  children: ReactNode;
}) {
  const { status } = useSession();
  const { data: user, error } = useSWR<UserData>(
    status === "authenticated" ? "/userdata" : null,
    { refreshInterval: 5000 }
  );

  return (
    <UserDataContext.Provider value={{ user }}>
      {children}
    </UserDataContext.Provider>
  );
}
