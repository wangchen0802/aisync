"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="box empty" style={{ marginTop: 24 }}>
      <b>这一页没加载出来</b>
      <p>可能是网络或数据库连接的问题。{error.digest ? <span className="mono"> #{error.digest}</span> : null}</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn pri sm" onClick={reset}>重试</button>
        <Link className="btn sm" href="/">回总览</Link>
      </div>
    </div>
  );
}
