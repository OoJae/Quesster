"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuesster } from "../hooks/useQuesster";
import { readContract, getPublicClient } from "@wagmi/core";
import { config } from "../providers/AppProvider";
import { erc20Abi } from "viem";
import { supabase } from "../utils/supabaseClient";
import { motion } from "framer-motion";

// --- HELPER FUNCTIONS ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isYesterday = (dateString: string) => {
  const date = new Date(dateString);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
};

const isToday = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

const getDailySeed = () => {
  const today = new Date();
  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
};

const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// --- COMPONENTS ---

const LoadingSpinner = () => (
  <div style={styles.spinnerContainer}>
    <style>
      {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
    </style>
    <div style={styles.spinner} />
    <p style={styles.spinnerText}>LOADING QUESSTER</p>
  </div>
);

export default function Home() {
  // --- STATE ---
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'daily' | 'pro' | 'create' | 'community' | 'leaderboard' | 'play_community'>('daily');
  
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [communityQuizzes, setCommunityQuizzes] = useState<any[]>([]);
  const [userStreak, setUserStreak] = useState(0);
  
  const [newTitle, setNewTitle] = useState("");
  // Initial state has 3 empty options
  const [newQuestions, setNewQuestions] = useState([{text: "", options: ["", "", ""], correct: ""}]);
  
  const [isAllowanceChecked, setIsAllowanceChecked] = useState(false);
  const [localHasJoined, setLocalHasJoined] = useState(false);
  const [dbHasJoinedToday, setDbHasJoinedToday] = useState(false);

  const { 
    joinQuest, approve, createQuest, mintBadge,
    isPending, error, hasSufficientAllowance,
    refetchAllowance, hasJoined, refetchHasJoined, badgeBalance, refetchBadge,
    ENTRY_FEE, CUSD_SEPOLIA_ADDRESS, QUESSTER_GAME_ADDRESS, userAddress
  } = useQuesster();
  
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [showAddCash, setShowAddCash] = useState(false);

  // --- FETCH DATA ---

  const fetchQuestions = useCallback(async (difficulty: string) => {
    setQuestions([]); setMessage("");
    const { data, error } = await supabase.from('questions').select('*').eq('active', true).eq('difficulty', difficulty);
    
    if (data && data.length > 0) {
      const seed = getDailySeed();
      const modifier = difficulty === 'hard' ? 999 : 0;
      const shuffled = [...data].sort((a, b) => (0.5 - seededRandom(seed + a.id + b.id + modifier)));
      const dailySelection = shuffled.slice(0, 3);
      setQuestions(dailySelection);
      setAnswers(Array(dailySelection.length).fill(""));
    }
  }, []);

  const fetchCommunityQuizzes = useCallback(async () => {
    const { data, error } = await supabase
      .from('community_quizzes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) console.error("Error fetching quizzes", error);
    setCommunityQuizzes(data || []); 
  }, []);

  const fetchLeaderboardAndStats = useCallback(async () => {
    const { data: lbData } = await supabase.from('profiles').select('*').order('score', { ascending: false }).limit(10);
    if (lbData) setLeaderboard(lbData);
    if (userAddress) {
      const { data: userData } = await supabase.from('profiles').select('*').eq('wallet_address', userAddress).single();
      if (userData) {
          setUserStreak(userData.current_streak || 0);
          if (userData.last_played_at && isToday(userData.last_played_at)) {
              setDbHasJoinedToday(true);
          }
      }
    }
  }, [userAddress]);

  const saveScoreToBackend = async (address: string, points: number) => {
    const { data: currentProfile } = await supabase.from('profiles').select('*').eq('wallet_address', address).single();
    let newScore = points;
    let newStreak = 1;
    if (currentProfile) {
      newScore = (currentProfile.score || 0) + points;
      const lastPlayed = currentProfile.last_played_at;
      if (lastPlayed && isYesterday(lastPlayed)) newStreak = (currentProfile.current_streak || 0) + 1;
      else if (lastPlayed && isToday(lastPlayed)) newStreak = currentProfile.current_streak || 1;
    }
    await supabase.from('profiles').upsert({ 
        wallet_address: address, score: newScore, current_streak: newStreak, last_played_at: new Date()
      }, { onConflict: 'wallet_address' });
    
    fetchLeaderboardAndStats();
  };

  // --- INIT ---
  useEffect(() => {
    if (activeTab === 'daily') fetchQuestions('easy');
    if (activeTab === 'pro') fetchQuestions('hard');
    if (activeTab === 'community') fetchCommunityQuizzes();
    
    const init = async () => {
      if (window.ethereum && (window.ethereum as any).isMiniPay) {
        setIsMiniPay(true);
        if (userAddress) {
            try {
              await Promise.all([
                refetchAllowance(), 
                refetchHasJoined(), 
                fetchLeaderboardAndStats()
              ]);
            } finally {
              setIsAppReady(true); 
              setIsAllowanceChecked(true);
            }
        }
      } else {
          fetchLeaderboardAndStats();
          setIsAppReady(true);
          setIsAllowanceChecked(true);
      }
    };
    init();

  }, [refetchAllowance, refetchHasJoined, fetchLeaderboardAndStats, fetchQuestions, activeTab, userAddress, fetchCommunityQuizzes]);

  const handleAnswerSelect = (questionIndex: number, answer: string) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = answer;
    setAnswers(newAnswers);
  };

  // --- COMMUNITY PLAY LOGIC ---
  const handlePlayCommunity = (quiz: any) => {
    const formattedQuestions = quiz.questions.map((q: any, i: number) => ({
        id: i,
        question_text: q.text,
        options: q.options,
        correct_answer: q.correct 
    }));

    setQuestions(formattedQuestions);
    setAnswers(Array(formattedQuestions.length).fill(""));
    setMessage(""); 
    setActiveTab('play_community');
  };

  const submitCommunityQuiz = () => {
    if (answers.includes("")) { setMessage("Please answer all questions!"); return; }
    
    let score = 0;
    questions.forEach((q, i) => {
        if (answers[i] === q.correct_answer) score++;
    });
    
    if (score === questions.length) {
        setMessage("🎉 PERFECT SCORE! You are a genius.");
    } else {
        setMessage(`You got ${score} out of ${questions.length} correct.`);
    }
  };

  // --- TRANSACTIONS ---
  const pollForAllowance = async () => {
    if (!userAddress) { setMessage("Re-connect wallet."); return; }
    for (let i = 0; i < 20; i++) { 
      await sleep(2000); 
      try {
        const newAllowance = await readContract(config, {
          address: CUSD_SEPOLIA_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [userAddress, QUESSTER_GAME_ADDRESS],
        });
        if (newAllowance && newAllowance >= ENTRY_FEE) {
          setMessage("Approval successful! You can now join.");
          setIsLoading(false);
          refetchAllowance(); 
          return;
        }
      } catch (e) { }
    }
    setMessage("Approval timed out. Please refresh.");
    setIsLoading(false);
  };

  const handleApprove = async () => {
    setMessage("Approving 0.1 cUSD..."); setIsLoading(true); setShowAddCash(false);
    try {
      const hash = await approve();
      if (hash) { setMessage(`Sent! Waiting for confirmation...`); await pollForAllowance(); }
      else { setMessage(`Approval failed.`); setIsLoading(false); }
    } catch (e: any) { setMessage(e.message); setIsLoading(false); }
  };

  const handleSubmit = async () => {
     if (answers.includes("")) { setMessage("Please answer all questions!"); return; }
    setMessage("Submitting..."); setIsLoading(true); setShowAddCash(false);
    try {
      const hash = await joinQuest(answers); 
      if (hash) {
        setLocalHasJoined(true);
        setDbHasJoinedToday(true); 
        setMessage("Transaction Sent! Updating UI...");
        setIsLoading(false); 

        const publicClient = getPublicClient(config);
        if (publicClient) {
          publicClient.waitForTransactionReceipt({ hash }).then(async () => {
              setMessage("Success! You have joined the quest.");
              const points = activeTab === 'pro' ? 20 : 10;
              if(userAddress) await saveScoreToBackend(userAddress, points);
              refetchHasJoined();
          });
        }
      } else { 
        setMessage(`Transaction Failed.`); 
        setIsLoading(false); 
      }
    } catch (e: any) { 
        let errorMsg = e.message || "Unknown error";
        if (errorMsg.includes("transfer value exceeded") || errorMsg.includes("insufficient funds")) {
            setMessage("Insufficient cUSD.");
            setShowAddCash(true);
        } else {
            setMessage("Error: " + errorMsg);
        }
        setIsLoading(false); 
    }
  };

  const handleCreateQuiz = async () => {
    if(!newTitle || newQuestions.some(q => !q.text || !q.correct || q.options.some(o => !o.trim()))) {
        setMessage("Please fill all fields (including 3 options)."); return;
    }
    
    // Safety Check: Ensure Correct Answer is one of the options
    const currentQ = newQuestions[0];
    if (!currentQ.options.includes(currentQ.correct)) {
        setMessage(`One option MUST match the correct answer exactly: "${currentQ.correct}"`);
        return;
    }

    setMessage("Creating Quiz on Blockchain...");
    setIsLoading(true);

    try {
        const correctAnswers = newQuestions.map(q => q.correct);
        const txHash = await createQuest("0.1", 24, correctAnswers);

        if (txHash) {
            setMessage("Tx sent! Saving to DB...");
            const publicClient = getPublicClient(config);
            if (publicClient) {
                await publicClient.waitForTransactionReceipt({ hash: txHash });
                
                const { error: dbError } = await supabase.from('community_quizzes').insert({
                    blockchain_id: Date.now().toString(), 
                    creator: userAddress,
                    title: newTitle,
                    questions: newQuestions
                });

                if (dbError) throw dbError;
                
                setMessage("Quiz Created Successfully!");
                await fetchCommunityQuizzes();
                
                setNewTitle("");
                setNewQuestions([{text: "", options: ["", "", ""], correct: ""}]);
                setActiveTab('community');
            }
        }
    } catch(e:any) {
        console.error(e);
        setMessage("Error: " + (e.message || e.details || "Failed to create quiz"));
    }
    setIsLoading(false);
  }

  const handleMintBadge = async () => {
    setMessage("Minting Badge (Free)...");
    setIsLoading(true);
    try {
      const hash = await mintBadge();
      if (hash) {
        setMessage("Minting sent! Waiting...");
        const publicClient = getPublicClient(config);
        if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash });
            await refetchBadge(); 
            setMessage("Badge Minted! Pro Mode Unlocked.");
        }
      } else {
        setMessage("Minting failed.");
      }
    } catch (e: any) { setMessage(e.message); }
    setIsLoading(false);
  };
  
  const renderButton = () => {
    if (!isAppReady) return <button disabled style={styles.buttonDisabled}>Loading...</button>;
    if (isPending || isLoading) return <button disabled style={styles.buttonDisabled}>{message || "Processing..."}</button>;
    
    if (hasJoined || localHasJoined || dbHasJoinedToday) return (
      <div style={styles.successContainer}>
        <button disabled style={styles.buttonSuccess}>✅ You Joined Today!</button>
        <a href="https://twitter.com/intent/tweet?text=I%20just%20won%20rewards%20on%20Quesster!%20%F0%9F%8F%86%20%23Celo%20%23MiniPay" target="_blank" style={styles.buttonTwitter}>Share Victory on X</a>
      </div>
    );
    
    if (!hasSufficientAllowance) return <button onClick={handleApprove} style={styles.buttonPrimary}>Approve 0.1 cUSD</button>;
    return <button onClick={handleSubmit} style={styles.buttonPrimary}>Join Quest (0.1 cUSD)</button>;
  };

  const renderContent = () => {
    if (activeTab === 'create') {
        return (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.3}} style={styles.card}>
                <h3 style={styles.cardTitle}>Create New Quest</h3>
                <input placeholder="Quiz Title" style={styles.input} value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                
                <div style={{marginBottom: 20}}>
                    <p style={styles.label}>Question 1 (Demo)</p>
                    <input placeholder="Question Text" style={styles.input} value={newQuestions[0].text} onChange={e => {
                        const n = [...newQuestions]; n[0].text = e.target.value; setNewQuestions(n);
                    }} />
                    
                    <p style={styles.label}>Correct Answer (Must match one option below)</p>
                    <input placeholder="e.g. Paris" style={styles.input} value={newQuestions[0].correct} onChange={e => {
                        const n = [...newQuestions]; n[0].correct = e.target.value; setNewQuestions(n);
                    }} />

                    <p style={styles.label}>Options (Player Choices)</p>
                    {newQuestions[0].options.map((opt, i) => (
                         <input 
                            key={i}
                            placeholder={`Option ${i+1}`} 
                            style={styles.input} 
                            value={opt} 
                            onChange={e => {
                                const n = [...newQuestions]; 
                                const newOpts = [...n[0].options];
                                newOpts[i] = e.target.value;
                                n[0].options = newOpts;
                                setNewQuestions(n);
                            }} 
                         />
                    ))}
                </div>
                <button onClick={handleCreateQuiz} style={styles.buttonPrimary}>Mint Quest (0.1 cUSD)</button>
                {message && <p style={styles.message}>{message}</p>}
            </motion.div>
        )
    }

    if (activeTab === 'community') {
        return (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.3}} style={styles.card}>
                <h2 style={styles.cardTitle}>Community Quizzes</h2>
                {communityQuizzes.length === 0 ? <p style={styles.emptyText}>No community quizzes yet.</p> : 
                    communityQuizzes.map((q: any, i: number) => (
                        <div key={i} style={styles.communityRow}>
                            <div>
                                <h4 style={styles.communityTitle}>{q.title}</h4>
                                <p style={styles.communityCreator}>By: {q.creator?.substring(0,6)}...</p>
                            </div>
                            <button style={styles.miniButton} onClick={() => handlePlayCommunity(q)}>Play</button>
                        </div>
                    ))
                }
            </motion.div>
        )
    }

    // Play Community Mode
    if (activeTab === 'play_community') {
        return (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.3}}>
                <div style={{display:'flex', alignItems:'center', marginBottom: 20}}>
                    <button onClick={() => setActiveTab('community')} style={{background:'none', border:'none', fontSize: 24, cursor:'pointer'}}>←</button>
                    <h3 style={{...styles.sectionTitle, marginBottom:0, flex:1}}>Community Quest</h3>
                </div>

                <div style={styles.quizContainer}>
                    {questions.map((q, qIndex) => (
                        <div key={q.id} style={styles.questionBox}>
                            <p style={styles.questionText}>{q.question_text}</p>
                            <div style={styles.optionsGrid}>
                                {q.options.map((option: string, i: number) => (
                                    <button 
                                        key={i} 
                                        onClick={() => handleAnswerSelect(qIndex, option)} 
                                        style={
                                            message 
                                            ? (option === q.correct_answer ? styles.optionSuccess : (answers[qIndex] === option ? styles.optionError : styles.option))
                                            : (answers[qIndex] === option ? styles.optionSelected : styles.option)
                                        }
                                        disabled={!!message} 
                                    >
                                        {option || "Empty Option"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                {!message ? (
                    <button onClick={submitCommunityQuiz} style={styles.buttonPrimary}>Check Answers</button>
                ) : (
                    <div style={styles.successCard}>
                        <p style={{fontSize:18, fontWeight:'bold', marginBottom: 20}}>{message}</p>
                        <button onClick={() => setActiveTab('community')} style={styles.buttonSuccess}>Back to List</button>
                    </div>
                )}
            </motion.div>
        );
    }

    if (activeTab === 'leaderboard') {
      return (
        <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.3}} style={styles.card}>
          <h2 style={styles.cardTitle}>Top Players</h2>
          {leaderboard.length === 0 ? <p style={styles.emptyText}>No scores yet.</p> : 
            leaderboard.map((player, i) => (
              <div key={i} style={styles.leaderboardRow}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                      <span style={styles.rank}>#{i+1}</span>
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                          <span style={styles.address}>{player.wallet_address.substring(0, 6)}...{player.wallet_address.substring(38)}</span>
                          <span style={styles.streak}>🔥 {player.current_streak} day streak</span>
                      </div>
                  </div>
                  <span style={styles.score}>{player.score} pts</span>
              </div>
            ))}
        </motion.div>
      );
    }

    if (activeTab === 'pro') {
      if (!badgeBalance || Number(badgeBalance) === 0) {
         return (
           <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{duration:0.3}} style={styles.lockedCard}>
             <div style={{fontSize: 50, marginBottom: 15}}>🔒</div>
             <h3 style={styles.lockedTitle}>Pro Quest Locked</h3>
             <p style={styles.lockedText}>You need a <b>Quesster Genius Badge</b> NFT to access Pro Mode and earn double points.</p>
             <button onClick={handleMintBadge} style={styles.buttonPrimary}>Mint Badge (Free)</button>
           </motion.div>
         );
      }
      return (
        <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.3}}>
          <div style={styles.proHeader}>
            <div style={styles.proBadgeContainer}>
                <span style={{fontSize: 20}}>🏆</span> 
                <span style={styles.proBadgeText}>Pro Mode Active</span>
            </div>
            <p style={styles.proSubtext}>Double Points (20xp) Enabled</p>
          </div>
          <div style={styles.quizContainer}>
            {questions.map((q, qIndex) => (
                <div key={q.id} style={styles.questionBox}>
                <p style={styles.questionText}>{q.question_text}</p>
                <div style={styles.optionsGrid}>
                    {q.options.map((option: string, i: number) => (
                    <button key={i} onClick={() => handleAnswerSelect(qIndex, option)} style={answers[qIndex] === option ? styles.optionSelected : styles.option}>{option}</button>
                    ))}
                </div>
                </div>
            ))}
         </div>
         {renderButton()}
         {message && <p style={styles.message}>{message}</p>}
        </motion.div>
      );
    }

    return (
       <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{duration:0.3}}>
        <h3 style={styles.sectionTitle}>Daily Challenge</h3>
        <div style={styles.quizContainer}>
          {questions.length > 0 ? questions.map((q, qIndex) => (
            <div key={q.id} style={styles.questionBox}>
              <p style={styles.questionText}>{q.question_text}</p>
              <div style={styles.optionsGrid}>
                {q.options.map((option: string, i: number) => (
                  <button key={i} onClick={() => handleAnswerSelect(qIndex, option)} style={answers[qIndex] === option ? styles.optionSelected : styles.option}>{option}</button>
                ))}
              </div>
            </div>
          )) : <p style={styles.emptyText}>Loading Questions...</p>}
        </div>
        {renderButton()}
        {message && <p style={styles.message}>{message}</p>}
        {showAddCash && <a href="https://minipay.opera.com/add_cash" style={styles.buttonYellow}>Add Cash</a>}
       </motion.div>
    );
  };

  if (!isAppReady) return <LoadingSpinner />;

  return (
    <div style={styles.container}>
      <div style={styles.backgroundGradient} />
      
      <header style={styles.header}>
        <div style={styles.headerTop}>
            <div style={{display:'flex', alignItems:'center', gap: 10}}>
               <span style={{fontSize: 32}}>🦁</span>
               <h1 style={styles.title}>Quesster</h1>
            </div>
            <div style={styles.streakPill}>🔥 {userStreak}</div>
        </div>

        <div style={styles.tabContainer}>
            {['daily', 'pro', 'create', 'community', 'leaderboard'].map((tab) => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab as any)} 
                    style={activeTab === tab ? styles.tabActive : styles.tab}
                >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
            ))}
        </div>
      </header>
      
      {!isMiniPay ? (
        <div style={styles.desktopWarning}>
            <p>Please open this app in <b>MiniPay</b> on mobile.</p>
        </div>
      ) : (
        <main style={styles.main}>{renderContent()}</main>
      )}
    </div>
  );
}

// --- PREMIUM STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: 480, margin: "0 auto", minHeight: "100vh", position: 'relative', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', color: '#333' },
  backgroundGradient: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, #E0F7FA 0%, #FFFFFF 100%)', zIndex: -1 },
  
  header: { padding: "20px", paddingTop: "40px", background: 'linear-gradient(135deg, #35D07F 0%, #2DB36C 100%)', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, boxShadow: '0 4px 20px rgba(53, 208, 127, 0.3)', marginBottom: 20 },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", margin: 0, letterSpacing: -0.5 },
  streakPill: { backgroundColor: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: 20, color: 'white', fontWeight: 'bold', fontSize: 14, backdropFilter: 'blur(5px)' },
  
  tabContainer: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 5, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' },
  tab: { background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' },
  tabActive: { background: '#FFFFFF', border: 'none', color: '#35D07F', padding: '8px 16px', borderRadius: 20, fontWeight: '800', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' },
  
  main: { padding: "10px 20px 40px 20px" },
  sectionTitle: { color: '#35D07F', textAlign: 'center', marginTop: 0, marginBottom: 20, fontSize: 18, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  
  card: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.08)", marginBottom: 20 },
  successCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 40, boxShadow: "0 10px 40px rgba(0,0,0,0.08)", textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.5s ease' },
  lockedCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 40, boxShadow: "0 10px 40px rgba(0,0,0,0.08)", textAlign: 'center', border: '1px solid #F0F0F0' },
  lockedTitle: { color: '#333', fontSize: 22, margin: 0, fontWeight: 800 },
  lockedText: { color: '#666', lineHeight: 1.6, margin: '15px 0', fontSize: 15 },
  
  quizContainer: { display: 'flex', flexDirection: 'column', gap: 20 },
  questionBox: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, boxShadow: "0 4px 15px rgba(0,0,0,0.05)", border: '1px solid #F5F5F5' },
  questionText: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 16, lineHeight: 1.5 },
  optionsGrid: { display: "flex", flexDirection: "column", gap: 10 },
  
  option: { padding: 16, fontSize: 15, backgroundColor: "#F7F9FC", border: "2px solid #F7F9FC", borderRadius: 14, cursor: "pointer", textAlign: "left", color: "#444", fontWeight: 600, transition: "all 0.2s", width: '100%' },
  optionSelected: { padding: 16, fontSize: 15, backgroundColor: "#E6F9F0", border: "2px solid #35D07F", borderRadius: 14, cursor: "pointer", textAlign: "left", fontWeight: "700", color: "#000", width: '100%', boxShadow: '0 4px 10px rgba(53, 208, 127, 0.2)' },
  optionSuccess: { padding: 16, fontSize: 15, backgroundColor: "#D1FAE5", border: "2px solid #10B981", borderRadius: 14, textAlign: "left", fontWeight: "700", color: "#065F46", width: '100%' },
  optionError: { padding: 16, fontSize: 15, backgroundColor: "#FEE2E2", border: "2px solid #EF4444", borderRadius: 14, textAlign: "left", fontWeight: "600", color: "#991B1B", width: '100%' },

  buttonPrimary: { width: "100%", padding: 18, fontSize: 16, fontWeight: "800", color: "#FFFFFF", background: 'linear-gradient(135deg, #35D07F 0%, #2DB36C 100%)', border: "none", borderRadius: 16, cursor: "pointer", marginTop: 10, boxShadow: '0 8px 20px rgba(53, 208, 127, 0.4)', letterSpacing: 0.5, transition: 'transform 0.1s' },
  buttonTwitter: { backgroundColor: "#1DA1F2", color: 'white', textDecoration: "none", display: "block", textAlign: "center", padding: 16, borderRadius: 16, fontWeight: 'bold', marginTop: 10, boxShadow: '0 4px 15px rgba(29, 161, 242, 0.3)' },
  buttonYellow: { display: 'block', width: "100%", padding: 18, fontSize: 16, fontWeight: "800", color: "#000", backgroundColor: "#FFD700", border: "none", borderRadius: 16, cursor: "pointer", marginTop: 10, boxShadow: '0 4px 15px rgba(255, 215, 0, 0.3)', textDecoration: 'none', textAlign: 'center' },
  buttonDisabled: { width: "100%", padding: 18, fontSize: 16, fontWeight: "800", color: "#999", backgroundColor: "#E0E0E0", border: "none", borderRadius: 16, cursor: "not-allowed", marginTop: 10 },
  successContainer: { width: '100%', marginTop: 20 },
  buttonSuccess: { width: "100%", padding: 18, fontSize: 16, fontWeight: "800", color: "#35D07F", backgroundColor: "#E0F5EA", border: "2px solid #35D07F", borderRadius: 16, cursor: "pointer", marginBottom: 10 },
  
  message: { textAlign: "center", marginTop: 20, fontSize: 14, color: "#555", fontWeight: 500 },
  
  leaderboardContainer: { backgroundColor: 'white', borderRadius: 24, padding: 5 },
  leaderboardRow: { display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #F5F5F5', alignItems: 'center' },
  rank: { fontWeight: '900', color: '#35D07F', width: '30px', fontSize: 18, fontStyle: 'italic' },
  address: { fontFamily: 'monospace', color: '#333', fontSize: 15, fontWeight: 700 },
  streak: { fontSize: 11, color: '#888', fontWeight: 600, marginTop: 2 },
  score: { fontWeight: '800', color: '#111', fontSize: 16, background: '#F5F5F5', padding: '4px 10px', borderRadius: 10 },
  
  cardTitle: { margin: '0 0 20px 0', fontSize: 22, fontWeight: 800, color: '#111', textAlign: 'center' },
  emptyText: { color: '#888', textAlign: 'center', padding: 20, fontStyle: 'italic' },
  
  communityRow: { display: 'flex', justifyContent: 'space-between', padding: '16px', backgroundColor: '#F9F9F9', marginBottom: '12px', borderRadius: '16px', alignItems: 'center', border: '1px solid #EEE' },
  communityTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#333' },
  communityCreator: { margin: '4px 0 0 0', fontSize: 12, color: '#888' },
  miniButton: { padding: '8px 16px', fontSize: 12, fontWeight: 'bold', backgroundColor: '#35D07F', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer' },
  
  createContainer: { backgroundColor: 'white', borderRadius: 24, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.08)" },
  label: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  input: { width: '100%', padding: 16, borderRadius: 14, border: '2px solid #EEE', backgroundColor: '#F9F9F9', color: '#333', marginBottom: 16, fontSize: 15, outline: 'none', fontWeight: 500, boxSizing: 'border-box', transition: 'border-color 0.2s' },
  
  proHeader: { textAlign: 'center', marginBottom: 25 },
  proBadgeContainer: { display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: '#FFF8E1', padding: '8px 16px', borderRadius: 30, border: '1px solid #FFE082' },
  proBadgeText: { fontWeight: '800', color: '#F57F17', fontSize: 14 },
  proSubtext: { color: '#666', fontSize: 13, fontWeight: 600, marginTop: 8 },
  
  spinnerContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#35D07F' },
  spinner: { border: '4px solid rgba(255, 255, 255, 0.3)', width: '50px', height: '50px', borderRadius: '50%', borderLeftColor: '#fff', animation: 'spin 1s linear infinite' },
  spinnerText: { color: 'white', marginTop: 20, fontFamily: 'sans-serif', fontSize: 14, fontWeight: 800, letterSpacing: 2 },
  
  desktopWarning: { textAlign: 'center', color: '#333', marginTop: 50, fontSize: 18, padding: 20 },
};