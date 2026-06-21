import { useEffect, useRef, useState } from "react";
import styles from "./MirrorMode.module.css";

const QUESTIONS = [
  {
    stage: 1,
    question: "먼저 물어보고 싶어. 넌 구체적으로 어떤 어려움을 겪고 있어?",
    placeholder: "네 상황을 자유롭게 말해줄래?",
  },
  {
    stage: 2,
    question: "그렇군. 그럼 그 문제가 해소된 모습은 구체적으로 어떠한가?",
    placeholder: "이상적인 상태를 그려줄래?",
  },
  {
    stage: 3,
    question: "그 목표로 나아가는 것을 방해하는 것은 정확히 무엇인가?",
    placeholder: "무엇이 막고 있는지 말해봐.",
  },
  {
    stage: 4,
    question: "그 장애물은 어떻게 개선할 수 있을까?",
    placeholder: "어떤 해결책을 생각해봤어?",
  },
  {
    stage: 5,
    question: "마지막이야. 그 해결안은 언제 어떻게 실행하면 될까?",
    placeholder: "구체적인 계획을 세워봐.",
  },
];

export default function MirrorMode({ onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [currentStage, setCurrentStage] = useState(1);
  const [userInput, setUserInput] = useState("");
  const [responses, setResponses] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [mirrorResponse, setMirrorResponse] = useState("");
  const [error, setError] = useState(null);

  const currentQuestion = QUESTIONS.find((q) => q.stage === currentStage);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("카메라 접근이 거부되었습니다.");
      }
    };

    startCamera();

    return () => {
      const video = videoRef.current;
      if (video?.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!userInput.trim()) return;

    setIsLoading(true);
    setError(null);
    setMirrorResponse("");

    try {
      const response = await fetch("/api/deepConversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: currentStage,
          userInput: userInput.trim(),
          previousResponses: responses,
          question: currentQuestion.question,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `응답 처리에 실패했습니다. (${response.status})`);
      }

      const data = await response.json();
      setMirrorResponse(data.reflection);
      setResponses((prev) => ({
        ...prev,
        [currentStage]: userInput,
      }));

      setTimeout(() => {
        if (currentStage < 5) {
          setCurrentStage(currentStage + 1);
          setUserInput("");
          setMirrorResponse("");
        }
      }, 3000);
    } catch (err) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClose = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
    }
    onClose();
  };

  return (
    <div className={styles.mirrorModeOverlay}>
      <div className={styles.mirrorModeContainer}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={handleClose}
          aria-label="Close mirror mode"
        >
          ✕
        </button>

        <div className={styles.cameraContainer}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.mirrorVideo}
          />
          <canvas ref={canvasRef} className={styles.mirrorCanvas} />

          <div className={styles.mirrorOverlay}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${(currentStage / 5) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.conversationPanel}>
          <div className={styles.stageIndicator}>
            단계 {currentStage} / 5
          </div>

          <div className={styles.mirrorQuestion}>
            {currentQuestion?.question}
          </div>

          {mirrorResponse && (
            <div className={styles.mirrorReflection}>
              <p>{mirrorResponse}</p>
            </div>
          )}

          {error && <div className={styles.errorMessage}>{error}</div>}

          {currentStage < 5 || !mirrorResponse ? (
            <div className={styles.inputSection}>
              <textarea
                ref={(el) => el?.focus()}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={currentQuestion?.placeholder}
                className={styles.mirrorInput}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !userInput.trim()}
                className={styles.submitButton}
              >
                {isLoading ? "생각하는 중..." : "다음"}
              </button>
            </div>
          ) : (
            <div className={styles.completionMessage}>
              <p>깊은 성찰을 완성했어. 너의 여정을 응원할게.</p>
              <button
                type="button"
                onClick={handleClose}
                className={styles.finishButton}
              >
                거울과의 대화 끝내기
              </button>
            </div>
          )}

          {currentStage > 1 && (
            <button
              type="button"
              onClick={() => {
                setCurrentStage(Math.max(1, currentStage - 1));
                setUserInput("");
                setMirrorResponse("");
              }}
              className={styles.prevButton}
            >
              ← 이전 단계
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
