import { useEffect, useState } from "react";
import LoadingView from "components/LoadingView";
import { GlobalHead } from "components/GlobalHead";
import Layout, { Theme } from "components/Layout";
import axios from "lib/axios";
import { signOut } from "next-auth/react";
import { CustomNextPage } from "components/CustomNextPage";
import { AccountSettings } from "lib/responses";
import { useRouter } from "next/router";
import RoundXIcon from "../../components/RoundXIcon";

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
  "Retro",
  "Coffee",
  "Light",
  "Lofi",
  "Cmyk",
  "Cyberpunk",
  "Valentine",
  "Cupcake",
  "Winter",
  "Lemonade",
  "Corporate"
];

const themeData: ThemeData[] = themes.map((theme) => ({
  name: theme,
  value: theme.toLowerCase()
}));

const Settings: CustomNextPage = () => {
  const router = useRouter();
  const [accountSettings, setAccountSettings] = useState<AccountSettings>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [formTheme, setFormTheme] = useState("");

  function deleteAccount() {
    fetch("/backend/settings", {method: "DELETE"}).then(() => {
      signOut().then(() => {
        router.push("/").then();
      });
    });
  }

  useEffect(() => {
    if (!accountSettings) {
      fetch("/backend/settings").then(res => res.json()).then((settings) => {
        setName(settings.name);
        if (settings.settings) {
          if (settings.settings.bio) {
            setBio(settings.settings.bio);
          }
          if (settings.settings.website) {
            setWebsite(settings.settings.website);
          }
          if (settings.settings.location) {
            setLocation(settings.settings.location);
          }
          if (settings.settings.emailNotifications) {
            setEmailNotifications(settings.settings.emailNotifications);
          }
          if (settings.settings.theme) {
            setFormTheme(settings.settings.theme);
          }
        }
        setAccountSettings(settings);
      });
    }
  }, [accountSettings]);

  if (accountSettings) {
    if (!accountSettings.settings) {
      accountSettings.settings = {};
    }

    return (
      <>
        <GlobalHead />
        <Layout>
          <main className="container flex-grow p-2">
            <h1 className="text-2xl font-bold">Settings</h1>
            {error && (
              <div className="alert alert-error my-3 shadow-lg">
                <div className="flex flex-wrap">
                  <RoundXIcon/>
                  <span>{error}</span>
                </div>
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();

                if (isLoading) {
                  return;
                }

                const formData = new FormData(e.currentTarget);

                formData.set("name", name);
                formData.set("bio", bio);
                formData.set("website", website);
                formData.set("location", location);
                formData.set(
                  "emailNotifications",
                  emailNotifications ? "true" : "false"
                );
                formData.set("theme", formTheme);

                setIsLoading(true);
                axios
                  .put("/settings", formData, {
                    headers: {
                      "Content-Type": "multipart/form-data"
                    }
                  })
                  .then(() => {
                    setIsLoading(false);
                    setError(null);
                    router.reload();
                  })
                  .catch((res) => {
                    setIsLoading(false);
                    setError(`${res.response.data.message}`);
                  });
              }}
            >
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Your Email</span>
                </label>
                <label className="input-group">
                  <span>Email</span>
                  <input
                    disabled
                    type="text"
                    value={accountSettings.email}
                    className="input input-bordered"
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Your Name</span>
                </label>
                <label className="input-group">
                  <span>Name</span>
                  <input
                    type="text"
                    defaultValue={accountSettings.name}
                    maxLength={20}
                    minLength={3}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="SomeUsername"
                    className="input input-bordered"
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Your bio</span>
                </label>
                <textarea
                  id="input-bio"
                  name="bio"
                  className="textarea textarea-bordered h-24"
                  onInput={(e) => setBio(e.currentTarget.value)}
                  maxLength={255}
                  defaultValue={accountSettings.settings.bio}
                  placeholder="Write your bio here..."
                ></textarea>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Your website</span>
                </label>
                <label className="input-group">
                  <span>Website</span>
                  <input
                    type="url"
                    defaultValue={accountSettings.settings.website}
                    onInput={(e) => setWebsite(e.currentTarget.value)}
                    maxLength={80}
                    pattern="https://.*"
                    placeholder="https://example.com"
                    className="input input-bordered"
                  />
                </label>
                <label className="label">
                  <span className="label-text-alt">
                    Must start with https://
                  </span>
                </label>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Your location</span>
                </label>
                <label className="input-group">
                  <span>Location</span>
                  <input
                    type="text"
                    defaultValue={accountSettings.settings.location}
                    onInput={(e) => setLocation(e.currentTarget.value)}
                    maxLength={80}
                    placeholder="London, UK"
                    className="input input-bordered"
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label max-w-[12rem] cursor-pointer">
                  <span className="label-text">Email Notifications</span>
                  <input
                    id="input-emailNotifications"
                    name="emailNotifications"
                    type="checkbox"
                    onInput={(e) =>
                      setEmailNotifications(e.currentTarget.checked)
                    }
                    className="checkbox checkbox-primary"
                    defaultChecked={accountSettings.settings.emailNotifications}
                  />
                </label>
              </div>

              <Theme.Consumer>
                {({ theme, setTheme }) => (
                  <div className="form-control w-full max-w-xs">
                    <label className="label">
                      <span className="label-text">Theme</span>
                    </label>
                    <select
                      id="input-theme"
                      value={theme}
                      name="theme"
                      className="select select-bordered"
                      onChange={(event) => {
                        setFormTheme(event.currentTarget.value);
                        setTheme(event.target.value);
                      }}
                    >
                      {themeData.map(({ name, value }) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Theme.Consumer>

              <div className="form-control">
                <div>
                  <input
                    type="submit"
                    className="btn btn-primary mt-6"
                    value="Submit"
                  />
                </div>
              </div>
            </form>
            <label
              htmlFor="delete-modal"
              className="modal-button btn btn-error mt-6"
            >
              Delete Account
            </label>
            <input type="checkbox" id="delete-modal" className="modal-toggle" />
            <div className="modal" id="delete-modal">
              <div className="modal-box">
                <h3 className="text-lg font-bold">
                  Do you really want to delete your account?
                </h3>
                <p className="py-4">
                  This action will delete your entire account and is permanent.
                </p>
                <div className="modal-action">
                  <label htmlFor="delete-modal" className="btn btn-primary">
                    NO
                  </label>
                  <label
                    onClick={deleteAccount}
                    htmlFor="delete-modal"
                    className="btn btn-error"
                  >
                    YES
                  </label>
                </div>
              </div>
            </div>
          </main>
        </Layout>
      </>
    );
  } else {
    return <LoadingView />;
  }
};

Settings.auth = true;

// noinspection JSUnusedGlobalSymbols
export default Settings;
