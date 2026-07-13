import Logo from "../Assets/chatgpt.svg";
import Bookmark from "../Assets/message.svg";
import ChatGPT from "../Assets/chatgptLogo.svg";
import UserIcon from "../Assets/user-icon.png";
import LogoIcon from "../Assets/chatgptLogo.svg";
import { useEffect, useRef, useState } from "react";
import sendMessage from "../apiHub/openai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const customTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: "#1a1730",
    borderRadius: "12px",
    padding: "1.6rem",
    margin: 0
  }
};

function markdownToPlainText(md) {
  return md
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => '\n' + code.trim() + '\n')
    .replace(/^(.+)\n[=]{2,}\s*$/gm, '$1')
    .replace(/^(.+)\n[-]{2,}\s*$/gm, '$1')
    .replace(/^#{1,6}\s+(.+)/gm, '$1')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s*/gm, '')
    .replace(/^[-=*_]{3,}\s*$/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*(\d+)\.\s+/gm, '$1. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function App() {

    const showYourFace = useRef(null);
    const textAreaRef = useRef(null);
    const abortControllerRef = useRef(null);   // ✅ tracks current request

    const [state, updateState] = useState("");
    const [bag, updateBag] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newQuestion, setNewQuestion] = useState("");
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [streamingText, setStreamingText] = useState("");
    const typingAbortRef = useRef(false);
    const isUserScrollingRef = useRef(false);
    const cardRef = useRef(null);
    
    function shoot(e) {
        
        updateState(e.target.value);
        
    }

    function keyDown(e) {

        if (e.key === "Enter" && !e.shiftKey) {

            e.preventDefault();

            if (!loading) {
                trigger();
            }

        }

    }

    function typeOut(text) {
        
        if (text.includes("```")) {
            
            setStreamingText(text);
            return Promise.resolve();
        
        }
        
            typingAbortRef.current = false;
            return new Promise((resolve) => {
            
            const words = text.split(" ");
            const delay = Math.max(10, Math.min(50, 2000 / words.length));
            
            let i = 0;
            
            setStreamingText("");
            
            function next() {
                
                if (typingAbortRef.current) { resolve(); return; }
                
                if (i < words.length) {
                    
                    setStreamingText(prev => prev + (i === 0 ? "" : " ") + words[i]);
                    
                    i++;
                    
                    setTimeout(next, delay);
                
                } else {
                    
                    resolve();
                }
            }
            next();
        });
    }

    async function trigger(question = "") {

        if (loading) return;

        const text = (question || newQuestion || state).trim();

        if (!text) return;

        updateState("");

        if (textAreaRef.current) {
            textAreaRef.current.style.height = "auto";
        }

        updateBag(prev => [
            ...prev,
            {
                text,
                isBot: false
            }
        ]);

        setLoading(true);

        // ✅ Create a new AbortController for this request
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {

            const response = await sendMessage(text, controller.signal);   // ✅ pass signal

            // ✅ If null, user stopped — don't add anything to chat
            if (response !== null) {
                await typeOut(response);
                
                updateBag(prev => [
                    ...prev,
                    
                    {
                        text: response,
                        isBot: true
                    }
                ]);
                setStreamingText("");
            }

        }

        catch (err) {

            // ✅ Ignore abort errors silently
            if (err.name !== "AbortError") {
                console.error(err);

                updateBag(prev => [
                    ...prev,
                    {
                        text: "Something went wrong. Please try again.",
                        isBot: true
                    }
                ]);
            }

        }

        finally {

            setLoading(false);
            setNewQuestion("");
            abortControllerRef.current = null;

        }

    }
    
    function stopGeneration() {
        
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        
        typingAbortRef.current = true;
        
        setStreamingText("");
        setLoading(false);

    }
    
    useEffect(() => {
        
        const card = cardRef.current;
        
        if (!card) return;
        const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = card;
        isUserScrollingRef.current = scrollHeight - scrollTop - clientHeight > 100;
    };
    
    card.addEventListener("scroll", handleScroll);
    return () => card.removeEventListener("scroll", handleScroll);
    
    }, []);

    useEffect(() => {
        
        if (!isUserScrollingRef.current) {
            
            showYourFace.current?.scrollIntoView({
            behavior: "smooth"
        });
    }

    }, [bag, streamingText]);

    useEffect(() => {
        
        const ta = textAreaRef.current;
        
        if (!ta) return;
        
        if (!state) {
            
            ta.style.height = "";   
            return;
        
        }
        
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    
    }, [state]);

    function refresh() {

        window.location.reload();

    }

    function copyText(text, index) {
        navigator.clipboard.writeText(markdownToPlainText(text));
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    }
    
    function questionsTrigger(e) {
        
        const questionDiv = e.target.closest(".question");
        
        if (!questionDiv) return;
        
        const question = questionDiv.querySelector(".ques").innerText;
        
        setNewQuestion(question);
        
        trigger(question);
    
    }

    return (
        <>
            <div className="main-component">

                <div className="side-1">

                    <div className="side-division-1">

                        <div className="logo-image">
                            <img src={Logo} alt="ChatGPT Logo" />
                            <span className="md-sm-heading">ChatGPT</span>
                        </div>

                        <div className="side-1-btn">
                            <button onClick={refresh}>
                                <i className="fa-solid fa-plus"></i>
                                New Chat
                            </button>
                        </div>

                        <div
                            className="side-1-questions"
                            onClick={questionsTrigger}
                        >

                            <div className="question">
                                <img src={Bookmark} alt="" />
                                <span className="ques">
                                    What is Programming ?
                                </span>
                            </div>

                            <div className="question">
                                <img src={Bookmark} alt="" />
                                <span className="ques">
                                    How to use API ?
                                </span>
                            </div>

                        </div>

                    </div>

                    <div
                        className="side-division-2"
                    >

                        <div className="side-division-2-icon">
                            <i className="fa-solid fa-house"></i>
                            <span className="text">Home</span>
                        </div>

                        <div className="side-division-2-icon">
                            <i className="fa-solid fa-bookmark"></i>
                            <span className="text">Bookmark</span>
                        </div>
                        
                        <a
                        href="https://github.com/deepanshu1420"
                        target="_blank"
                        rel="noreferrer"
                        className="side-division-2-icon"
                        style={{ textDecoration: "none", color: "inherit" }}
                        >
                            <i className="fa-brands fa-github"></i>
                            <span className="text">GitHub</span>
                            </a>

                    </div>

                </div>

                <div className="side-2">

                    <div className="bot-texts">

                        <div className="greeting">

                            <img src={ChatGPT} alt="ChatGPT" />

                            <p>
                                Hello! I'm Deepanshu Sharma, a future-focused software developer building AI-powered applications. This app recreates a ChatGPT-like experience with seamless multi-model AI integration, a modern responsive interface, and an intuitive dialogue-based UI.
                            </p>

                        </div>

                    </div>

                    <div className="card" ref={cardRef}>

                        {
                            bag.map((ele, index) => (

                                <div
                                    key={index}
                                    className={ele.isBot ? "bot-text" : "user-text"}
                                >

                                    <img
                                        src={ele.isBot ? LogoIcon : UserIcon}
                                        alt={ele.isBot ? "Bot" : "User"}
                                    />

                                    <div className="message-content">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{

                                                code({ children, className }) {

                                                    const match =
                                                        /language-(\w+)/.exec(className || "");

                                                    if (match) {

                                                        return (
                                                            <SyntaxHighlighter
                                                                style={customTheme}
                                                                language={match[1]}
                                                                PreTag="div"
                                                            >
                                                                {String(children).replace(/\n$/, "")}
                                                            </SyntaxHighlighter>
                                                        );

                                                    }

                                                    return (
                                                        <code className={className}>
                                                            {children}
                                                        </code>
                                                    );

                                                }

                                            }}
                                        >

                                            {ele.text}

                                        </ReactMarkdown>
                                        {ele.isBot && (
                                            <div
                                                className="copy-btn"
                                                onClick={() => copyText(ele.text, index)}
                                            >
                                                <i className={copiedIndex === index ? "fa-solid fa-check" : "fa-regular fa-copy"}></i>
                                            </div>
                                        )}

                                    </div>

                                </div>

                            ))
                        }

                        {loading && !streamingText && (
                            
                            <div className="bot-text typing-wrapper">
                                <img src={LogoIcon} alt="Bot" />
                                <div className="message-content">
                                    <div className="typing-dots">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                        </div>
                                        </div>
                                        </div>
                                    )}
                                    
                                    {streamingText && (
                                        <div className="bot-text">
                                            <img src={LogoIcon} alt="Bot" />
                                            <div className="message-content">
                                                <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code({ children, className }) {
                                                        const match = /language-(\w+)/.exec(className || "");
                                                        if (match) {
                                                            return (
                                                            <SyntaxHighlighter style={customTheme} language={match[1]} PreTag="div">
                                                                {String(children).replace(/\n$/, "")}
                                                                </SyntaxHighlighter>
                                                                );
                                                            }
                                                            return <code className={className}>{children}</code>;
                                                        }
                                                    }}
                                                    >
                                                        {streamingText}
                                                        </ReactMarkdown>
                                                        </div>
                                                        </div>
                                                    )}

                        <div
                            className="last"
                            ref={showYourFace}
                        ></div>

                    </div>

                    <div className="footer">

                        <div className="input-text">

                            <textarea
                                ref={textAreaRef}
                                placeholder="Send a message"
                                value={state}
                                onChange={shoot}
                                onKeyDown={keyDown}
                                disabled={loading}
                                rows={1}
                            />

                            {
                                loading ? (

                                    <div
                                        className="action-btn stop-btn"
                                        onClick={stopGeneration}
                                    >
                                        <i className="fa-solid fa-stop"></i>
                                    </div>

                                ) : (

                                    <div
                                        className={`action-btn send-btn ${
                                            !(state.trim() || newQuestion.trim())
                                                ? "disabled"
                                                : ""
                                        }`}
                                        onClick={() => trigger()}
                                    >
                                        <i className="fa-solid fa-arrow-up"></i>
                                    </div>

                                )
                            }

                        </div>

                        <p className="footer-text">
                            ChatGPT Clone can make mistakes. Check important info. <span className="copyright">© 2026</span>
                        </p>

                    </div>

                </div>

            </div>
        </>
    );
}

export default App;