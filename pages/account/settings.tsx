import {useEffect, useState} from 'react';
import LoadingView from "../../components/LoadingView";
import {GlobalHead} from "../../components/GlobalHead";
import Layout, {Theme} from "../../components/Layout";
import axios from "../../lib/axios";
import {signOut} from "next-auth/react";
import {CustomNextPage} from "../../components/CustomNextPage";
import {AccountSettings} from "../../lib/responses";
import {useRouter} from "next/router";

interface ThemeData {
  name: string;
  value: string;
}

const themes = [
  "Dark",
  "Synthwave",
  "Forest",
  "Black",
  "Luxury",
  "Halloween",
  "Business",
  "Dracula",
  "Night",
  "Coffee",
  "Lofi",
  "Cmyk"
];

const themeData: ThemeData[] = themes.map(theme => ({
  name: theme,
  value: theme.toLowerCase(),
}));

const Settings: CustomNextPage = () => {
  const router = useRouter();
  const [accountSettings, setAccountSettings] = useState<AccountSettings>()
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [formTheme, setFormTheme] = useState("");

  function deleteAccount() {
    axios.delete("/settings").then(() => {
      signOut().then(() => {
        router.push("/").then()
      })
    });
  }

  useEffect(() => {
    if (!accountSettings) {
      axios.get('/settings').then(res => {
        const settings: AccountSettings = res.data;
        setName(settings.name);
        if (settings.settings) {
          if (settings.settings.bio) {
            setBio(settings.settings.bio);
          }
          if (settings.settings.emailNotifications) {
            setEmailNotifications(settings.settings.emailNotifications);
          }
          if (settings.settings.theme) {
            setFormTheme(settings.settings.theme);
          }
        }
        setAccountSettings(settings)
      })
    }
  }, [accountSettings])

  if (accountSettings) {
    if (!accountSettings.settings) {
      accountSettings.settings = {}
    }

    return (
        <>
          <GlobalHead/>
          <Layout>
            <main className="container p-2">
              <h1 className="font-bold text-2xl">Settings</h1>
              {error &&
                  <div className="my-3 alert alert-error shadow-lg">
                      <div>
                          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6"
                               fill="none"
                               viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                          <span>{error}</span>
                      </div>
                  </div>
              }
              <form onSubmit={async (e) => {
                e.preventDefault();

                if (isLoading) {
                  return;
                }

                const formData = new FormData(e.currentTarget);

                formData.set("name", name);
                formData.set("bio", bio);
                formData.set("emailNotifications", emailNotifications ? "true" : "false");
                formData.set("theme", formTheme);

                setIsLoading(true);
                axios.put('/settings', formData, {
                  headers: {
                    'Content-Type': 'multipart/form-data'
                  }
                }).then((res) => {
                  setIsLoading(false);
                  setError(null);
                  router.reload()
                }).catch((res) => {
                  setIsLoading(false);
                  setError(`${res.response.data.message}`)
                })
              }}>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your Email</span>
                  </label>
                  <label className="input-group">
                    <span>Email</span>
                    <input disabled type="text" value={accountSettings.email}
                           className="input input-bordered"/>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your Name</span>
                  </label>
                  <label className="input-group">
                    <span>Name</span>
                    <input type="text" defaultValue={accountSettings.name}
                           onInput={(e) => setName(e.currentTarget.value)}
                           placeholder="SomeUsername"
                           className="input input-bordered"/>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your bio</span>
                  </label>
                  <textarea id="input-bio" name="bio" className="textarea textarea-bordered h-24"
                            onInput={(e) => setBio(e.currentTarget.value)}
                            defaultValue={accountSettings.settings.bio}
                            placeholder="Write your bio here..."></textarea>
                </div>

                <div className="form-control">
                  <label className="label cursor-pointer max-w-[12rem]">
                    <span className="label-text">Email Notifications</span>
                    <input id="input-emailNotifications" name="emailNotifications" type="checkbox"
                           onInput={(e) => setEmailNotifications(e.currentTarget.checked)}
                           className="checkbox checkbox-primary"
                           defaultChecked={accountSettings.settings.emailNotifications}/>
                  </label>
                </div>

                <Theme.Consumer>
                  {({theme, setTheme}) => (
                      <div className="form-control w-full max-w-xs">
                        <label className="label">
                          <span className="label-text">Theme</span>
                        </label>
                        <select id="input-theme" value={theme} name="theme" className="select select-bordered"
                                onChange={(event) => {
                                  setFormTheme(event.currentTarget.value);
                                  setTheme(event.target.value)
                                }}>
                          {themeData.map(({name, value}) => (
                              <option key={value} value={value}>{name}</option>
                          ))}
                        </select>
                      </div>
                  )}
                </Theme.Consumer>

                <div className="form-control">
                  <div>
                    <input type="submit" className="btn btn-primary mt-6" value="Submit"/>
                  </div>
                </div>
              </form>
              <label htmlFor="delete-modal" className="btn btn-error modal-button mt-6">Delete Account</label>
              <input type="checkbox" id="delete-modal" className="modal-toggle"/>
              <div className="modal" id="delete-modal">
                <div className="modal-box">
                  <h3 className="font-bold text-lg">Do you really want to delete your account?</h3>
                  <p className="py-4">This action will delete your entire account and is not revertable.</p>
                  <div className="modal-action">
                    <label htmlFor="delete-modal" className="btn btn-primary">NO</label>
                    <label onClick={deleteAccount} htmlFor="delete-modal" className="btn btn-error">YES</label>
                  </div>
                </div>
              </div>
            </main>
          </Layout>
        </>
    )
  } else {
    return <LoadingView/>
  }
}

Settings.auth = true

// noinspection JSUnusedGlobalSymbols
export default Settings
