package com.example.worldcashbox.ui.employees

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.worldcashbox.R
import com.example.worldcashbox.data.model.Employee
import com.example.worldcashbox.data.model.Store
import com.google.android.material.card.MaterialCardView

class EmployeesAdapter(
    private var employees: MutableList<Employee>,
    private var stores: List<Store>,
    private val onItemClick: (Employee) -> Unit
) : RecyclerView.Adapter<EmployeesAdapter.EmployeeViewHolder>() {

    fun updateEmployees(newEmployees: List<Employee>) {
        employees.clear()
        employees.addAll(newEmployees)
        notifyDataSetChanged()
    }

    fun updateStores(newStores: List<Store>) {
        stores = newStores
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): EmployeeViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_employee, parent, false)
        return EmployeeViewHolder(view)
    }

    override fun onBindViewHolder(holder: EmployeeViewHolder, position: Int) {
        if (position < employees.size) {
            val employee = employees[position]
            holder.bind(employee, stores)
            holder.itemView.setOnClickListener { onItemClick(employee) }
        }
    }

    override fun getItemCount() = employees.size

    class EmployeeViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val nameTextView: TextView = itemView.findViewById(R.id.nameTextView)
        private val phoneTextView: TextView = itemView.findViewById(R.id.phoneTextView)
        private val storeTextView: TextView = itemView.findViewById(R.id.storeTextView)
        private val roleTextView: TextView = itemView.findViewById(R.id.roleTextView)
        private val statusTextView: TextView = itemView.findViewById(R.id.statusTextView)

        fun bind(employee: Employee, stores: List<Store>) {
            nameTextView.text = employee.name ?: "Не указано"
            phoneTextView.text = employee.phone
            
            val storeName = if (employee.storeId != null) {
                stores.find { it.id == employee.storeId }?.name ?: "Магазин не найден"
            } else {
                "Без привязки к магазину"
            }
            storeTextView.text = storeName
            
            roleTextView.text = when (employee.role) {
                "manager" -> "Менеджер"
                "employee" -> "Сотрудник"
                else -> employee.role
            }
            
            statusTextView.text = if (employee.isActive) "Активен" else "Неактивен"
            statusTextView.setTextColor(
                if (employee.isActive) 
                    itemView.context.getColor(R.color.success)
                else 
                    itemView.context.getColor(R.color.text_muted)
            )
        }
    }
}
