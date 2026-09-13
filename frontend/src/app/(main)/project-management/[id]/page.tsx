"use client";

import { useParams } from "next/navigation";
import ProjectManagementClient from "../ProjectManagementClient";

export default function ProjectManagementDetailPage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? Number(raw) : Array.isArray(raw) ? Number(raw[0]) : NaN;

  return <ProjectManagementClient projectId={Number.isFinite(id) ? id : undefined} />;
}
