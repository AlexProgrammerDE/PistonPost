import dynamic from "next/dynamic";

const Picker = dynamic(import("emoji-picker-react"), { ssr: false });

export default function EmojiPicker({
  onEmojiClick
}: {
  onEmojiClick: (emoji: string) => void;
}) {
  return (
    <div className="absolute z-50">
      <Picker
        pickerStyle={{ "box-shadow": "none" }}
        native
        onEmojiClick={(_, emojiData) => onEmojiClick(emojiData.emoji)}
      />
    </div>
  );
}
