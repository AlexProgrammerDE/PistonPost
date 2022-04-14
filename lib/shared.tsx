import React from "react";

export function onTagInput(e: React.KeyboardEvent<HTMLInputElement>, setTags: (tags: string[]) => void, tags: string[]) {
  if (e.key === "Enter") {
    e.preventDefault()

    const value = e.currentTarget.value.trim()
    if (tags.length < 5 && !tags.includes(value) && tags.filter(tag => tag.toLowerCase() === value.toLowerCase()).length <= 0) {
      setTags([...tags, value]);
      e.currentTarget.value = "";
      return;
    }
  }
}
;
