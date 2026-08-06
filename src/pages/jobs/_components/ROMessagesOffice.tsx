import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { MessageSquare, Send, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { format } from "date-fns";

const TECH_ROLES = ["mechanic", "mobile_mechanic"];

export default function ROMessagesOffice({ roId }: { roId: Id<"repairOrders"> }) {
  const messages = useQuery(api.messages.getByRO, { roId });
  const markRead = useMutation(api.messages.markReadByOffice);
  const sendMessage = useMutation(api.messages.send);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark messages as read when panel is visible
  useEffect(() => {
    if (messages && messages.length > 0) {
      void markRead({ roId });
    }
  }, [messages, roId, markRead]);

  // Auto-scroll to bottom
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
      <div className="space-y-3">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-12 w-2/3 ml-auto" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[250px]">
      {/* Messages list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 max-h-[400px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessageSquare size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No messages</p>
            <p className="text-xs text-muted-foreground mt-1">
              Send a message to the tech working on this job
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isTech = TECH_ROLES.includes(msg.senderRole);
            return (
              <div
                key={msg._id}
                className={cn(
                  "flex flex-col max-w-[85%]",
                  isTech ? "mr-auto items-start" : "ml-auto items-end"
                )}
              >
                {/* Sender */}
                <div className="flex items-center gap-1.5 mb-1">
                  {isTech ? (
                    <Wrench size={10} className="text-orange-400" />
                  ) : (
                    <User size={10} className="text-primary" />
                  )}
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {msg.senderName} {isTech ? "(Tech)" : "(Office)"}
                  </span>
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    isTech
                      ? "bg-orange-500/10 text-foreground border border-orange-500/20 rounded-bl-md"
                      : "bg-primary text-primary-foreground rounded-br-md"
                  )}
                >
                  {msg.body}
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
      <div className="border-t border-border mt-4 pt-3 flex items-end gap-2">
        <Textarea
          placeholder="Reply to tech..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="resize-none text-sm min-h-[44px] max-h-[100px] rounded-xl"
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
