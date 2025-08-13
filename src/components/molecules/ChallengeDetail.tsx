import { Badge } from "../atoms/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../atoms/Table";

export default function ChallengeDetail(allResults: { type: string; success: boolean; score: number; frames: number; matchedFrames: number }[]) {
  return (
    <div className="space-y-4">
      <Badge variant={allResults.every((r) => r.success) ? "success" : "error"}>
        Hasil {allResults.length} Challenge → {allResults.every((r) => r.success) ? "Lolos Semua" : "Gagal"}
      </Badge>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jenis</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Skor</TableHead>
            <TableHead>Frames</TableHead>
            <TableHead>Matched Frames</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allResults.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-bold">{item.type.replace("_", " ").toUpperCase()}</TableCell>
              <TableCell>
                <Badge variant={item.success ? "success" : "error"}>
                  {item.success ? "Sukses" : "Gagal"}
                </Badge>
              </TableCell>
              <TableCell>{item.score.toFixed(2)}</TableCell>
              <TableCell>{item.frames}</TableCell>
              <TableCell>{item.matchedFrames}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
