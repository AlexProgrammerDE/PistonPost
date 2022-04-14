import {createContext, ReactNode, useEffect, useState} from "react";
import {UserData} from "../lib/responses";
import axios from "../lib/axios";
import {useSession} from "next-auth/react";

export const UserDataContext = createContext({
    user: null as unknown as UserData | undefined,
});

export default function UserDataProvider({children}: {children: ReactNode}) {
    const {status} = useSession()
    const [user, setUser] = useState<UserData>()

    useEffect(() => {
        if (status === "authenticated" && !user) {
            axios.get("/userdata").then(res => {
                setUser(res.data)
            })
        }
    }, [status, user])

    return (
        <UserDataContext.Provider value={{user}}>
            {children}
        </UserDataContext.Provider>
    )
}
