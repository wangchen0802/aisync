import Link from "next/link";

export default function NotFound() {
  return (
    <div className="box empty" style={{ marginTop: 24 }}>
      <b>找不到这条内容</b>
      <p>可能已被删除，或者只有创建者能看。</p>
      <Link className="btn sm" href="/">回总览</Link>
    </div>
  );
}
