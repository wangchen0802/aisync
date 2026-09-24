export default function Loading() {
  return (
    <div className="skel" aria-busy="true" aria-label="加载中">
      <span className="skel-h" />
      <span className="skel-l" style={{ width: "32%" }} />
      <div className="skel-grid">
        <span className="skel-b" />
        <span className="skel-b" />
      </div>
    </div>
  );
}
