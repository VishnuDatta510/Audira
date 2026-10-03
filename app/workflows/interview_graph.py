from typing import TypedDict
from langgraph.graph import END, START, StateGraph
from app.services.agent import agent


class InterviewState(TypedDict):
    profile: dict
    brief: dict
    questions: list[str]


def read_profile(state: InterviewState) -> dict:
    return {"brief": agent.read_profile(state["profile"])}


def write_opening_questions(state: InterviewState) -> dict:
    return {"questions": agent.opening_questions({**state["profile"], "agent_brief": state["brief"]})}


graph = StateGraph(InterviewState)
graph.add_node("read_profile", read_profile)
graph.add_node("write_opening_questions", write_opening_questions)
graph.add_edge(START, "read_profile")
graph.add_edge("read_profile", "write_opening_questions")
graph.add_edge("write_opening_questions", END)
interview_graph = graph.compile()
