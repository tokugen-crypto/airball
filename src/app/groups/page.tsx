import { redirect } from "next/navigation";

/** The join/start page moved to the home page; keep old links working. */
export default function GroupsRedirect() {
  redirect("/");
}
