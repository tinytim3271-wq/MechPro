import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { MessageSquare, Send, User, Headset } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { format } from "date-fns";

const TECH_ROLES = ["mechanic", "mobile_mechanic"];

export default function ROMessagePanel({ roId }: { roId: Id<"repairOrders"> }) {
  const messages = useQuery(api.messages.getByRO, { roId });
  const markRead = useMutation(api.messages.markReadByTech);
  const sendMessage = useMutation(api.messages.send);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark messages as read when panel opens
  useEffect(() => {
    if (messages && messages.length > 0) {
      void markRead({ roId });
    }
  }, [messages, roId, markRead]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await sendMessage({ roId, body: body.trim() });
      setBody("");
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (messages === undefined) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-12 w-2/3 ml-auto" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[300px] max-h-[60vh]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageSquare size={16} className="text-primary" />
        <span className="text-sm font-semibold">Messages with Office</span>
        {messages.length > 0 && (
          <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
            {messages.length}
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessageSquare size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Send a message to the office about this job
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = TECH_ROLES.includes(msg.senderRole);
            return (
              <div
                key={msg._id}
                className={cn(
                  "flex flex-col max-w-[85%]",
                  isMine ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {/* Sender label */}
                <div className="flex items-center gap-1.5 mb-1">
                  {isMine ? (
                    <User size={10} className="text-primary" />
                  ) : (
                    <Headset size={10} className="text-blue-400" />
                  )}
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {msg.senderName}
                  </span>
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {msg.body.split("\n").map((line, idx) => {
                    if (line.startsWith("Address:")) {
                      const addr = line.replace("Address: ", "");
                      return (
                        <a
                          key={idx}
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-blue-400 hover:underline cursor-pointer"
                        >
                          {line}
                        </a>
                      );
                    }
                    return <span key={idx}>{line}{idx < msg.body.split("\n").length - 1 && <br />}</span>;
                  })}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-muted-foreground/70 mt-1">
                  {format(new Date(msg._creationTime), "MMM d, h:mm a")}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3 flex items-end gap-2">
        <Textarea
          placeholder="Type a message to the office..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className="resize-none text-sm min-h-[40px] max-h-[100px] rounded-xl"
        />
        <Button
          size="icon"
          className="shrink-0 h-10 w-10 rounded-xl cursor-pointer"
          onClick={handleSend}
          disabled={!body.trim() || sending}
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
