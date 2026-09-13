import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
    key: string;
    header: React.ReactNode;
    cell: (row: T) => React.ReactNode;
    className?: string;
}

export default function DataTable<T>({
    title,
    columns,
    rows,
    emptyMessage = "No rows to display.",
}: {
    title?: string;
    columns: DataTableColumn<T>[];
    rows: T[];
    emptyMessage?: string;
}) {
    return (
        <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm">
            {title && (
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
            )}
            <CardContent className="p-0 sm:p-0">
                <ScrollArea className="w-full">
                    <Table className="min-w-[760px] bg-white">
                        <TableHeader className="bg-slate-50 [&_tr]:border-slate-200">
                            <TableRow className="border-slate-200 hover:bg-transparent">
                                {columns.map((column) => (
                                    <TableHead
                                        key={column.key}
                                        className={cn(
                                            "h-10 px-4 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500",
                                            column.className
                                        )}
                                    >
                                        {column.header}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow className="border-slate-100 hover:bg-transparent">
                                    <TableCell colSpan={columns.length} className="py-10 text-center text-slate-500">
                                        {emptyMessage}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row, index) => (
                                    <TableRow key={index} className="border-slate-100 hover:bg-slate-50/70">
                                        {columns.map((column) => (
                                            <TableCell
                                                key={column.key}
                                                className={cn("px-4 py-3 align-middle text-[13px] text-slate-700", column.className)}
                                            >
                                                {column.cell(row)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
